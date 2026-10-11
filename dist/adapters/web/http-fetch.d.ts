import http from 'node:http';
import { type FetchResult } from '../../contracts/web.js';
export { publicUrl, isPublicAddress } from '../../domain/network/public-url.js';
export type HttpDocument = {
    status: number;
    headers: http.IncomingHttpHeaders;
    text: string;
};
export type PublicHttpOptions = {
    signal: AbortSignal;
    method?: 'GET' | 'POST' | 'DELETE';
    body?: string;
    headers?: Record<string, string>;
};
export type PublicHttp = (url: URL, options: PublicHttpOptions) => Promise<HttpDocument>;
/** 预先验证全部 DNS 结果，并把同一结果固定给连接；禁止自动跟随重定向。 */
export declare function createPublicHttp(resolve?: (host: string) => Promise<Array<{
    address: string;
    family: number;
}>>, dispatch?: typeof http.request, trustedFakeIpHosts?: ReadonlySet<string>): PublicHttp;
export declare const requestPublic: PublicHttp;
export declare function extractMarkdown(html: string, url: string): {
    title?: string;
    markdown: string;
};
export declare function fetchWeb(value: string, options: {
    signal: AbortSignal;
    maxChars: number;
}, send?: PublicHttp): Promise<FetchResult>;
