import { DOMParser, parseHTML } from 'linkedom';
import { z } from 'zod';
import {
  WebError,
  type SearchResult,
  type SearchSource,
  type SearchEngine,
  type WebConfig,
} from '../../contracts/web.js';
import {
  publicUrl,
  createPublicHttp,
  type PublicHttp,
  type HttpDocument,
} from './http-fetch.js';
import { normalizeSources, searchProvider } from './search-providers.js';
import { callSearchMcp } from './search-mcp.js';

const EXA_MCP = 'https://mcp.exa.ai/mcp';
// 仅插件固定免密钥引擎兼容 Fake-IP；自定义实例和任意网页仍用严格公网校验。
const requestBuiltin = createPublicHttp(undefined, undefined, new Set(['mcp.exa.ai', 'html.duckduckgo.com', 'www.bing.com']));
const querySchema = z.string().trim().min(1).max(1000);
function text(value: string): string {
  const { document } = parseHTML(`<html><body>${value}</body></html>`);
  for (const node of document.querySelectorAll('script,style,iframe,object'))
    node.remove();
  return document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
function validResponse(response: HttpDocument): void {
  if (response.status !== 200)
    throw new WebError(
      [202, 403, 429].includes(response.status)
        ? 'WEB_SEARCH_BLOCKED'
        : 'WEB_HTTP_ERROR',
      `搜索入口不可用（HTTP ${response.status}）`,
    );
}

export function parseDuckDuckGo(html: string): SearchResult {
  const { document } = parseHTML(html);
  if (
    document.querySelector(
      '#anomaly-modal, .anomaly-modal, #challenge-form, #anomaly-form',
    )
  ) {
    throw new WebError('WEB_SEARCH_BLOCKED', 'DuckDuckGo 返回验证页');
  }
  for (const node of document.querySelectorAll('script,style,iframe,object'))
    node.remove();
  const sources: SearchSource[] = [];
  const anchors = document.querySelectorAll('.result__a');
  for (const anchor of anchors) {
    try {
      let url = new URL(
        anchor.getAttribute('href') ?? '',
        'https://html.duckduckgo.com',
      );
      if (
        url.hostname === 'duckduckgo.com' ||
        url.hostname.endsWith('.duckduckgo.com')
      ) {
        const target = url.searchParams.get('uddg');
        if (!target) continue;
        url = publicUrl(target);
      }
      const snippet = anchor
        .closest('.result')
        ?.querySelector('.result__snippet')?.textContent;
      sources.push({
        url: url.href,
        title: anchor.textContent?.trim(),
        snippet: snippet?.trim(),
      });
    } catch {
      /* 不把广告跳转、脚本和无效链接作为来源。 */
    }
  }
  if (
    !anchors.length &&
    !document.querySelector('.no-results, .result--no-result')
  ) {
    throw new WebError(
      'WEB_INVALID_RESPONSE',
      'DuckDuckGo 未返回可识别的搜索页面',
    );
  }
  const result = normalizeSources(sources);
  if (anchors.length && !result.sources.length)
    throw new WebError('WEB_INVALID_RESPONSE', '搜索来源全部无效');
  return result;
}

export function parseBingRss(xml: string): SearchResult {
  // 不接受 DTD 或实体声明，XML 解析只在内存中完成。
  if (
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    !/<rss\b/i.test(xml) ||
    !/<\/rss>\s*$/i.test(xml.trim())
  ) {
    throw new WebError('WEB_INVALID_RESPONSE', 'Bing 未返回 RSS 搜索结果');
  }
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  if (!document.querySelector('rss > channel'))
    throw new WebError('WEB_INVALID_RESPONSE', 'Bing RSS 结构无效');
  const sources = [...document.querySelectorAll('channel > item')].map(
    (item) => ({
      url: item.querySelector('link')?.textContent?.trim() ?? '',
      title: text(item.querySelector('title')?.textContent ?? ''),
      snippet: text(item.querySelector('description')?.textContent ?? ''),
      publishedAt: item.querySelector('pubDate')?.textContent?.trim(),
    }),
  );
  const result = normalizeSources(sources);
  if (sources.length && !result.sources.length)
    throw new WebError('WEB_INVALID_RESPONSE', 'Bing RSS 来源全部无效');
  return result;
}

/** Exa 官方 MCP 当前只返回格式化来源文本，不能把任意答案中的 URL 当作来源。 */
export function parseExaMcp(input: unknown): SearchResult {
  const parsed = z
    .object({
      isError: z.boolean().optional(),
      content: z.array(
        z
          .object({ type: z.string(), text: z.string().optional() })
          .passthrough(),
      ),
    })
    .passthrough()
    .safeParse(input);
  if (!parsed.success)
    throw new WebError('WEB_INVALID_RESPONSE', 'Exa MCP 结果结构无效');
  if (parsed.data.isError)
    throw new WebError('WEB_SEARCH_FAILED', 'Exa MCP 搜索失败或额度受限');
  const sources: SearchSource[] = [];
  let empty = false;
  for (const block of parsed.data.content) {
    if (block.type !== 'text' || !block.text) continue;
    empty ||= /^No search results found\./.test(block.text.trim());
    for (const section of block.text.split(/\n\s*---\s*\n/)) {
      const match =
        /^Title: ([^\n]*)\r?\nURL: (https?:\/\/[^\s]+)\r?\nPublished: ([^\n]*)\r?\nAuthor: [^\n]*(?:\r?\n(?:Highlights:|Text:)\s*([\s\S]*))?\s*$/.exec(
          section.trim(),
        );
      if (!match) continue;
      sources.push({
        title: match[1],
        url: match[2]!,
        publishedAt: match[3] === 'N/A' ? undefined : match[3],
        snippet: match[4],
      });
    }
  }
  const result = normalizeSources(sources);
  if (!result.sources.length && !empty)
    throw new WebError('WEB_INVALID_RESPONSE', 'Exa MCP 未返回可识别来源');
  return result;
}

async function searchExaMcp(
  query: string,
  signal: AbortSignal,
  send: PublicHttp,
): Promise<SearchResult> {
  return parseExaMcp(
    await callSearchMcp(
      new URL(EXA_MCP),
      'web_search_exa',
      { query, numResults: 8 },
      signal,
      send,
    ),
  );
}

export class BuiltinSearch {
  private readonly cache = new Map<
    string,
    { until: number; result: SearchResult }
  >();
  constructor(
    private readonly send: PublicHttp = requestBuiltin,
    private readonly onFailure?: (engine: SearchEngine, code: string, diagnostic?: string) => void,
  ) {}

  async search(
    config: WebConfig,
    query: string,
    signal: AbortSignal,
    secret: (ref: string) => Promise<string | undefined>,
  ): Promise<SearchResult> {
    signal.throwIfAborted();
    const parsed = querySchema.safeParse(query);
    if (!parsed.success)
      throw new WebError('WEB_INVALID_ARGUMENTS', '搜索需要 1–1000 字符查询');
    query = parsed.data;
    const selected = config.providers.find(
      (p) => p.id === config.searchProviderId && p.enabled,
    );
    const cacheKey = JSON.stringify([config.engineOrder, selected, query]);
    for (const [key, value] of this.cache)
      if (value.until <= Date.now()) this.cache.delete(key);
    const cached = this.cache.get(cacheKey);
    if (cached) return structuredClone(cached.result);
    const failures: Array<{ engine: SearchEngine; code: string }> = [];
    const timeout = Math.min(
      10000,
      Math.floor(
        (config.searchTimeoutSeconds * 1000) / config.engineOrder.length,
      ),
    );
    const deadline = AbortSignal.any([
      signal,
      // 回退预算由毫秒换算为秒；浮点乘法可能产生 29998.999…，Node 只接受整数。
      AbortSignal.timeout(
        Math.max(1, Math.floor(config.searchTimeoutSeconds * 1000)),
      ),
    ]);
    let empty: SearchResult | undefined;
    for (const engine of config.engineOrder) {
      deadline.throwIfAborted();
      const abort = AbortSignal.any([deadline, AbortSignal.timeout(timeout)]);
      try {
        let result: SearchResult;
        if (engine === 'exa-mcp')
          result = await searchExaMcp(query, abort, this.send);
        else if (engine === 'duckduckgo' || engine === 'bing') {
          const url = new URL(
            engine === 'duckduckgo'
              ? 'https://html.duckduckgo.com/html/'
              : 'https://www.bing.com/search',
          );
          url.searchParams.set('q', query);
          if (engine === 'bing') url.searchParams.set('format', 'rss');
          const response = await this.send(url, {
            signal: abort,
            headers: {
              accept:
                engine === 'bing'
                  ? 'application/rss+xml, application/xml, text/xml'
                  : 'text/html',
            },
          });
          validResponse(response);
          result =
            engine === 'duckduckgo'
              ? parseDuckDuckGo(response.text)
              : parseBingRss(response.text);
        } else {
          // 可计费 API 只有显式列入顺序时才会使用，不复用主模型密钥。
          if (!selected || selected.type !== engine)
            throw new WebError(
              'WEB_NOT_CONFIGURED',
              '指定搜索后端未配置或未启用',
            );
          const key =
            engine === 'exa' ? await secret(selected.auth.secretRef) : '';
          if (engine === 'exa' && !key)
            throw new WebError('WEB_NO_KEY', 'Exa API 密钥未配置');
          result = await searchProvider(
            selected,
            key ?? '',
            query,
            abort,
            this.send,
          );
        }
        abort.throwIfAborted();
        result = { ...result, engine, failures: [...failures] };
        if (!result.sources.length) {
          empty = result;
          continue;
        }
        if (this.cache.size >= 100)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(cacheKey, {
          until: Date.now() + 60000,
          result: structuredClone(result),
        });
        return result;
      } catch (cause) {
        deadline.throwIfAborted();
        const failure = {
          engine,
          code: abort.aborted
            ? 'WEB_TIMEOUT'
            : cause instanceof WebError
              ? cause.code
              : networkErrorCode(cause),
        };
        failures.push(failure);
        this.onFailure?.(failure.engine, failure.code, cause instanceof WebError ? cause.diagnostic : undefined);
      }
    }
    if (empty) return { ...empty, failures };
    throw new WebError(
      'WEB_SEARCH_FAILED',
      `搜索引擎均不可用（${failures.map((f) => `${f.engine}: ${f.code}`).join('；')}）`,
    );
  }
}

/** 只记录固定网络错误码，不回显可能含密钥、查询或代理密码的错误文本。 */
function networkErrorCode(cause: unknown): string {
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? cause.code
      : undefined;
  return typeof code === 'string' &&
    [
      'ENOTFOUND',
      'EAI_AGAIN',
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'CERT_HAS_EXPIRED',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    ].includes(code)
    ? `WEB_NETWORK_${code}`
    : 'WEB_SEARCH_FAILED';
}
