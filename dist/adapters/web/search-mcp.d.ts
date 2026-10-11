import type { PublicHttp } from './http-fetch.js';
export declare function callSearchMcp(url: URL, name: string | string[], args: Record<string, unknown>, signal: AbortSignal, send: PublicHttp, authHeaders?: Record<string, string>): Promise<unknown>;
