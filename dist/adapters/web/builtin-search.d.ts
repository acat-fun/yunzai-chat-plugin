import { type SearchResult, type SearchEngine, type WebConfig } from '../../contracts/web.js';
import { type PublicHttp } from './http-fetch.js';
export declare function parseDuckDuckGo(html: string): SearchResult;
export declare function parseBingRss(xml: string): SearchResult;
/** Exa 官方 MCP 当前只返回格式化来源文本，不能把任意答案中的 URL 当作来源。 */
export declare function parseExaMcp(input: unknown): SearchResult;
export declare class BuiltinSearch {
    private readonly send;
    private readonly onFailure?;
    private readonly cache;
    constructor(send?: PublicHttp, onFailure?: ((engine: SearchEngine, code: string, diagnostic?: string) => void) | undefined);
    search(config: WebConfig, query: string, signal: AbortSignal, secret: (ref: string) => Promise<string | undefined>): Promise<SearchResult>;
}
