/**
 * 按供应商草稿调用上游 /models，结果只进入面板草稿，不写配置。
 */
import type { ProtocolId } from '../../../contracts/types.js';

export type DiscoveredModel = { id: string; displayName: string };

function modelsUrl(baseUrl: string): URL {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return new URL(`${trimmed}/models`);
}

function authHeaders(protocol: ProtocolId, apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (!apiKey) return headers;
  if (protocol === 'anthropic-messages') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function parseOpenAiLike(payload: unknown): DiscoveredModel[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: DiscoveredModel[] = [];
  const seen = new Set<string>();
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const id = String((item as { id?: unknown }).id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const displayName = String((item as { name?: unknown }).name ?? id).trim() || id;
    out.push({ id, displayName });
    if (out.length >= 2000) break;
  }
  return out;
}

export async function discoverUpstreamModels(input: {
  baseUrl: string;
  protocol: ProtocolId;
  apiKey?: string;
}): Promise<{ models: DiscoveredModel[]; truncated: boolean }> {
  let url: URL;
  try {
    url = modelsUrl(input.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
      throw new Error('invalid');
    }
  } catch {
    throw Object.assign(new Error('请输入有效的 HTTP(S) API 基础地址。'), { code: 'VALIDATION_ERROR' });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: authHeaders(input.protocol, input.apiKey),
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Object.assign(new Error('连接供应商失败，请检查地址与网络后重试。'), {
      code: 'UPSTREAM_TIMEOUT',
    });
  }

  if (response.status === 401 || response.status === 403) {
    throw Object.assign(new Error('供应商拒绝凭据，请检查 API 密钥。'), { code: 'UPSTREAM_AUTH_FAILED' });
  }
  if (response.status === 404 || response.status === 405 || response.status === 501) {
    throw Object.assign(new Error('该供应商不支持模型发现，请手动添加模型。'), {
      code: 'NOT_SUPPORTED',
    });
  }
  if (response.status === 429) {
    throw Object.assign(new Error('供应商频率受限，请稍后重试。'), { code: 'UPSTREAM_RATE_LIMITED' });
  }
  if (!response.ok) {
    throw Object.assign(new Error(`获取模型失败（HTTP ${response.status}）。`), {
      code: 'UPSTREAM_INVALID_RESPONSE',
    });
  }

  const payload = (await response.json()) as unknown;
  const models = parseOpenAiLike(payload);
  return { models, truncated: models.length >= 2000 };
}
