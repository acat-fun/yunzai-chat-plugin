import { type SearchResult, type WebProviderConfig, type SearchSource } from '../../contracts/web.js';
import { type PublicHttp } from './http-fetch.js';
export declare function normalizeSources(sources: SearchSource[], limit?: number): SearchResult;
export declare function parseDeepSeekSearch(input: unknown): SearchResult;
export declare function searchProvider(provider: WebProviderConfig, key: string, query: string, signal: AbortSignal, send?: PublicHttp): Promise<SearchResult>;
