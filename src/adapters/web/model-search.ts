import { z } from 'zod';
import type { GenerationRequest } from '../../application/ports/index.js';
import {
  WebError,
  type SearchResult,
  type SearchSource,
} from '../../contracts/web.js';
import { normalizeSources, parseDeepSeekSearch } from './search-providers.js';
import { postJson } from '../llm/transport.js';
import { requestPublic, type PublicHttp } from './http-fetch.js';
import { callSearchMcp } from './search-mcp.js';
import { matchNativeSearch } from './model-search-routing.js';

/** 辅助请求只使用当前模型与凭据，查询之外不发送聊天上下文。 */
export async function searchCurrentModel(
  req: GenerationRequest,
  query: string,
  signal: AbortSignal,
  send?: PublicHttp,
): Promise<SearchResult> {
  const { provider, root, endpoint, body, headers, format } = matchNativeSearch(
    req,
    query,
  );
  let data: unknown;
  if (format === 'glm-mcp') {
    data = await callSearchMcp(
      new URL(`${root}/${endpoint}`),
      ['web_search_prime', 'webSearchPrime'],
      body,
      signal,
      send ?? requestPublic,
      headers,
    );
    data = unwrapMcpSources(data);
  } else if (send) {
    const response = await send(new URL(`${root}/${endpoint}`), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (response.status < 200 || response.status >= 300)
      throw new WebError(
        `WEB_HTTP_${response.status}`,
        `当前模型 API 搜索失败（HTTP ${response.status}）`,
      );
    try {
      data = JSON.parse(response.text);
    } catch {
      throw new WebError('WEB_INVALID_RESPONSE', '搜索返回无效 JSON');
    }
  } else {
    // API 目标来自主人保存的配置，沿用主模型传输；网页 URL 仍走独立公网校验。
    const response = await postJson(
      { ...req, baseUrl: root, signal },
      endpoint,
      body,
      headers,
    );
    if (!response.ok)
      throw new WebError(
        response.code.startsWith('HTTP_')
          ? `WEB_${response.code}`
          : response.code === 'TIMEOUT'
            ? 'WEB_TIMEOUT'
            : response.code === 'NETWORK'
              ? 'WEB_NETWORK_ERROR'
              : response.code,
        '当前模型 API 搜索失败，请确认接口和模型支持原生搜索',
      );
    data = response.data;
  }
  const object = z.record(z.unknown());
  const parsed = object.safeParse(data);
  if (!parsed.success || parsed.data.error)
    throw new WebError('WEB_INVALID_RESPONSE', '搜索返回结构无效');
  if (format === 'anthropic')
    return { ...parseDeepSeekSearch(data), nativeProvider: provider };
  const result = parsed.data;
  const sources: SearchSource[] = [];
  let found = false;
  const add = (input: unknown) => {
    const item = object.safeParse(input);
    if (!item.success) return;
    const citation = object.safeParse(item.data.url_citation);
    const value = citation.success ? citation.data : item.data;
    if (typeof value.url !== 'string' && typeof value.link === 'string')
      value.url = value.link;
    if (typeof value.url !== 'string') return;
    found = true;
    sources.push({
      url: value.url,
      title: typeof value.title === 'string' ? value.title : undefined,
      snippet:
        typeof value.cited_text === 'string'
          ? value.cited_text
          : typeof value.snippet === 'string'
            ? value.snippet
            : typeof value.content === 'string'
              ? value.content
              : undefined,
      publishedAt:
        typeof value.publish_date === 'string'
          ? value.publish_date
          : typeof value.date === 'string'
            ? value.date
            : undefined,
    });
  };
  if (format === 'glm' || format === 'glm-mcp' || format === 'kimi') {
    const raw =
      format !== 'kimi'
        ? (result.web_search ?? result.search_result)
        : result.search_results;
    if (Array.isArray(raw)) {
      found = true;
      raw.forEach(add);
    }
    if (format === 'glm' && Array.isArray(result.choices)) {
      const choice = object.safeParse(result.choices[0]);
      if (!choice.success || choice.data.finish_reason !== 'stop')
        throw new WebError('WEB_SEARCH_FAILED', '搜索请求未完成');
    }
  } else if (format === 'qwen') {
    const output = object.safeParse(result.output);
    if (!output.success)
      throw new WebError('WEB_INVALID_RESPONSE', 'Qwen 搜索结果无效');
    const info = object.safeParse(output.data.search_info);
    if (info.success && Array.isArray(info.data.search_results)) {
      found = true;
      info.data.search_results.forEach(add);
    }
  } else if (format === 'gemini') {
    const candidates = z.array(object).min(1).safeParse(result.candidates);
    if (!candidates.success)
      throw new WebError('WEB_INVALID_RESPONSE', 'Gemini 搜索结果无效');
    for (const candidate of candidates.data) {
      if (candidate.finishReason && candidate.finishReason !== 'STOP')
        throw new WebError('WEB_SEARCH_FAILED', '搜索请求未完成');
      const metadata = object.safeParse(candidate.groundingMetadata);
      if (!metadata.success || !Array.isArray(metadata.data.groundingChunks))
        continue;
      found = true;
      for (const chunk of metadata.data.groundingChunks) {
        const parsed = object.safeParse(chunk);
        if (!parsed.success) continue;
        const web = object.safeParse(parsed.data.web);
        if (web.success) add({ ...web.data, url: web.data.uri });
      }
    }
  } else if (format === 'responses') {
    if (result.status !== 'completed' || !Array.isArray(result.output))
      throw new WebError('WEB_SEARCH_FAILED', '搜索请求未完成');
    for (const raw of result.output) {
      const block = object.safeParse(raw);
      if (!block.success) continue;
      if (block.data.type === 'web_search_call') {
        if (block.data.status !== 'completed')
          throw new WebError('WEB_SEARCH_FAILED', '搜索工具未完成');
        const action = object.safeParse(block.data.action);
        if (action.success && Array.isArray(action.data.sources)) {
          found = true;
          action.data.sources.forEach(add);
        }
      }
      if (block.data.type === 'message' && Array.isArray(block.data.content)) {
        for (const content of block.data.content) {
          const text = object.safeParse(content);
          if (text.success && Array.isArray(text.data.annotations))
            text.data.annotations.forEach(add);
        }
      }
    }
  } else {
    const choices = z
      .array(z.object({ finish_reason: z.string(), message: object }))
      .min(1)
      .safeParse(result.choices);
    if (!choices.success || choices.data[0]!.finish_reason !== 'stop')
      throw new WebError('WEB_SEARCH_FAILED', '搜索请求未完成');
    const message = choices.data[0]!.message;
    if (Array.isArray(message.annotations)) message.annotations.forEach(add);
    if (Array.isArray(result.search_results)) {
      found = true;
      result.search_results.forEach(add);
    }
    if (Array.isArray(result.citations))
      result.citations.forEach((url) =>
        add(typeof url === 'string' ? { url } : url),
      );
  }
  if (!found)
    throw new WebError(
      'WEB_SEARCH_UNSUPPORTED',
      '当前模型 API 未返回结构化搜索来源，不支持此搜索协议或尚未开通搜索能力',
    );
  return { ...normalizeSources(sources), nativeProvider: provider };
}

/** MCP 只接受结构化来源或 JSON 来源块，普通生成文本不会被当成搜索结果。 */
function unwrapMcpSources(input: unknown): unknown {
  const record = z.record(z.unknown());
  const result = record.safeParse(input);
  if (!result.success || result.data.isError)
    throw new WebError('WEB_SEARCH_FAILED', 'GLM 搜索 MCP 返回错误');
  const candidates: unknown[] = [
    result.data,
    result.data.structuredContent,
    result.data.data,
    result.data.result,
  ];
  if (Array.isArray(result.data.content))
    for (const block of result.data.content) {
      const item = record.safeParse(block);
      if (
        item.success &&
        item.data.type === 'text' &&
        typeof item.data.text === 'string'
      ) {
        try {
          let parsed: unknown = JSON.parse(item.data.text);
          if (typeof parsed === 'string') parsed = JSON.parse(parsed);
          candidates.push(parsed);
        } catch {
          /* 不从普通答案中猜测来源。 */
        }
      }
    }
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return { search_result: candidate };
    const value = record.safeParse(candidate);
    if (
      value.success &&
      !value.data.error &&
      (Array.isArray(value.data.search_result) ||
        Array.isArray(value.data.web_search) ||
        Array.isArray(value.data.results))
    )
      return {
        ...value.data,
        search_result: value.data.search_result ?? value.data.results,
      };
  }
  throw new WebError('WEB_INVALID_RESPONSE', 'GLM 搜索 MCP 未返回结构化来源');
}
