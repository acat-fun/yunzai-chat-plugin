import { upstreamErrorDetail } from './upstream-error.js';
import type { GenerationRequest, GenerationResult } from '../../application/ports/index.js';

export type JsonResult = { ok: true; data: unknown } | Extract<GenerationResult, { ok: false }>;

export async function postJson(req: GenerationRequest, endpoint: string, body: unknown, headers: Record<string, string>, send: typeof fetch = fetch): Promise<JsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);
  try {
    const base = new URL(req.baseUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      return { ok: false, code: 'INVALID_BASE_URL', message: 'API 基础地址无效' };
    }
    const response = await send(`${req.baseUrl.replace(/\/+$/, '')}/${endpoint}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body), signal: req.signal ? AbortSignal.any([controller.signal, req.signal]) : controller.signal, redirect: 'manual',
    });
    if (!response.ok) {
      const detail = await upstreamErrorDetail(response);
      return { ok: false, code: response.status === 402 || detail.includes('billing=insufficient_balance') ? 'INSUFFICIENT_BALANCE' : `HTTP_${response.status}`, message: `供应商请求失败（HTTP ${response.status}）${detail}` };
    }
    const reader = response.body?.getReader();
    if (!reader) return { ok: false, code: 'INVALID_RESPONSE', message: '供应商返回空响应' };
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4 * 1024 * 1024) {
          await reader.cancel();
          return { ok: false, code: 'RESPONSE_TOO_LARGE', message: '供应商响应超过 4 MiB' };
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    try { return { ok: true, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; }
    catch { return { ok: false, code: 'INVALID_RESPONSE', message: '供应商返回无效 JSON' }; }
  } catch {
    return { ok: false, code: req.signal?.aborted ? 'CANCELLED' : controller.signal.aborted ? 'TIMEOUT' : 'NETWORK', message: controller.signal.aborted ? '供应商请求超时' : '连接供应商失败' };
  } finally { clearTimeout(timer); }
}
