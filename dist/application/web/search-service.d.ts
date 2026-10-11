import { type SearchResult } from '../../contracts/web.js';
/** 原生搜索优先，但只占总预算的一部分，避免回退时已没有执行时间。 */
export declare function searchWithFallback(options: {
    signal: AbortSignal;
    timeoutSeconds: number;
    onFallback?(code: string): void;
    native(signal: AbortSignal): Promise<SearchResult>;
    builtin(signal: AbortSignal, remainingSeconds: number): Promise<SearchResult>;
}): Promise<SearchResult>;
