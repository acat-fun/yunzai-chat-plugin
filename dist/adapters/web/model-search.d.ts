import type { GenerationRequest } from '../../application/ports/index.js';
import { type SearchResult } from '../../contracts/web.js';
import { type PublicHttp } from './http-fetch.js';
/** 辅助请求只使用当前模型与凭据，查询之外不发送聊天上下文。 */
export declare function searchCurrentModel(req: GenerationRequest, query: string, signal: AbortSignal, send?: PublicHttp): Promise<SearchResult>;
