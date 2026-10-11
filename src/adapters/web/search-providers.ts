import { z } from 'zod';
import { WebError, type SearchResult, type WebProviderConfig, type SearchSource } from '../../contracts/web.js';
import { publicUrl, requestPublic, type PublicHttp } from './http-fetch.js';

const sourceSchema = z.object({ url: z.string(), title: z.string().optional(), text: z.string().optional(), snippet: z.string().optional(), publishedDate: z.string().optional(), date: z.string().optional() }).passthrough();
const nativeSchema = z.object({
  type: z.literal('message'),
  content: z.array(z.object({ type: z.string() }).passthrough()),
}).passthrough();

export function normalizeSources(sources: SearchSource[], limit = 8): SearchResult {
  const merged = new Map<string, SearchSource>();
  for (const item of sources) {
    if (item.url.length > 4096) continue;
    let url: string;
    try { url = publicUrl(item.url).href; } catch { continue; }
    const old = merged.get(url);
    merged.set(url, {
      url, title: old?.title || item.title?.slice(0, 512),
      snippet: old?.snippet || item.snippet?.slice(0, 4000),
      publishedAt: old?.publishedAt || item.publishedAt,
    });
  }
  return { sources: [...merged.values()].slice(0, limit), truncated: merged.size > limit };
}

export function parseDeepSeekSearch(input: unknown): SearchResult {
  const parsed = nativeSchema.safeParse(input);
  if (!parsed.success) throw new WebError('WEB_INVALID_RESPONSE', '原生搜索返回结构无效');
  const sources: SearchSource[] = [];
  const snippets = new Map<string, string>();
  let found = false;
  for (const block of parsed.data.content) {
    if (block.type === 'web_search_tool_result') {
      found = true;
      if (!Array.isArray(block.content)) throw new WebError('WEB_SEARCH_FAILED', '原生搜索工具返回错误');
      for (const item of block.content) {
        const result = z.object({ type: z.literal('web_search_result'), url: z.string(), title: z.string().optional(), page_age: z.string().optional() }).passthrough().safeParse(item);
        if (!result.success) throw new WebError('WEB_INVALID_RESPONSE', '原生搜索来源结构无效');
        sources.push({ url: result.data.url, title: result.data.title });
      }
    }
    if (block.type === 'text' && Array.isArray(block.citations)) {
      for (const citation of block.citations) {
        const result = z.object({ url: z.string(), cited_text: z.string() }).passthrough().safeParse(citation);
        if (result.success) snippets.set(result.data.url, result.data.cited_text);
      }
    }
  }
  if (!found) throw new WebError('WEB_SEARCH_UNSUPPORTED', '搜索模型未返回原生搜索结果，请核对账号和模型能力');
  return normalizeSources(sources.map(s => ({ ...s, snippet: snippets.get(s.url) })));
}

export async function searchProvider(provider: WebProviderConfig, key: string, query: string, signal: AbortSignal, send: PublicHttp = requestPublic): Promise<SearchResult> {
  if (provider.type === 'searxng') {
    const url = publicUrl(`${provider.baseUrl.replace(/\/+$/, '')}/search`);
    if (url.protocol !== 'https:') throw new WebError('WEB_BLOCKED_URL', 'SearXNG 必须使用公网 HTTPS');
    url.searchParams.set('q', query); url.searchParams.set('format', 'json');
    const response = await send(url, { signal, headers: { accept: 'application/json' } });
    if (response.status !== 200) throw new WebError('WEB_HTTP_ERROR', `SearXNG 搜索失败（HTTP ${response.status}）`);
    let data: unknown;
    try { data = JSON.parse(response.text); } catch { throw new WebError('WEB_INVALID_RESPONSE', 'SearXNG 未返回 JSON，请确认实例已启用 JSON 格式'); }
    const parsed = z.object({ results: z.array(z.object({ url: z.string(), title: z.string().optional(), content: z.string().optional(), publishedDate: z.string().optional() }).passthrough()) }).passthrough().safeParse(data);
    if (!parsed.success) throw new WebError('WEB_INVALID_RESPONSE', 'SearXNG 来源结构无效');
    const result = normalizeSources(parsed.data.results.map(s => ({ url: s.url, title: s.title, snippet: s.content, publishedAt: s.publishedDate })));
    if (parsed.data.results.length && !result.sources.length) throw new WebError('WEB_INVALID_RESPONSE', 'SearXNG 来源全部无效');
    return result;
  }
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let endpoint: string, body: unknown;
  if (provider.type === 'deepseek-native') {
    endpoint = 'messages';
    headers['x-api-key'] = key;
    headers.authorization = `Bearer ${key}`;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: provider.model, max_tokens: 4096,
      messages: [{ role: 'user', content: [{ type: 'text', text: `Perform a web search for the query: ${query}` }] }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: provider.maxUses }],
    };
  } else if (provider.type === 'exa') {
    endpoint = 'search'; headers['x-api-key'] = key;
    body = { query, numResults: 8, contents: { text: { maxCharacters: 4000 } } };
  } else {
    endpoint = 'chat/completions'; headers.authorization = `Bearer ${key}`;
    body = { model: provider.model || 'sonar', max_tokens: 1024, messages: [{ role: 'user', content: query }] };
  }
  const url = publicUrl(`${provider.baseUrl.replace(/\/+$/, '')}/${endpoint}`);
  if (url.protocol !== 'https:') throw new WebError('WEB_BLOCKED_URL', '搜索 API 必须使用 HTTPS');
  const response = await send(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (response.status < 200 || response.status >= 300) throw new WebError('WEB_HTTP_ERROR', `搜索请求失败（HTTP ${response.status}）`);
  let data: unknown;
  try { data = JSON.parse(response.text); } catch { throw new WebError('WEB_INVALID_RESPONSE', '搜索返回无效 JSON'); }
  if (provider.type === 'deepseek-native') return parseDeepSeekSearch(data);
  if (provider.type === 'perplexity') {
    const result = z.object({ search_results: z.array(sourceSchema).optional(), citations: z.array(z.string()).optional() }).passthrough().safeParse(data);
    if (!result.success || (result.data.search_results === undefined && result.data.citations === undefined)) throw new WebError('WEB_INVALID_RESPONSE', 'Perplexity 未返回搜索来源');
    return normalizeSources(result.data.search_results !== undefined
      ? result.data.search_results.map(s => ({ url: s.url, title: s.title, snippet: s.snippet, publishedAt: s.date }))
      : result.data.citations!.map(url => ({ url })));
  }
  const parsed = z.object({ results: z.array(sourceSchema) }).passthrough().safeParse(data);
  if (!parsed.success) throw new WebError('WEB_INVALID_RESPONSE', '搜索来源结构无效');
  return normalizeSources(parsed.data.results.map(s => ({
    url: s.url, title: s.title, snippet: s.snippet || s.text,
    publishedAt: s.publishedDate || s.date,
  })));
}
