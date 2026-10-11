import type { GenerationRequest } from '../../application/ports/index.js';
export type NativeSearchFormat = 'anthropic' | 'responses' | 'chat' | 'glm' | 'glm-mcp' | 'qwen' | 'kimi' | 'gemini';
export type NativeSearchPlan = {
    provider: string;
    root: string;
    endpoint: string;
    format: NativeSearchFormat;
    body: Record<string, unknown>;
    headers: Record<string, string>;
};
/** 域名优先识别厂商；网关按模型名选择扩展，但绝不把凭据转发至其他域名。 */
export declare function matchNativeSearch(req: GenerationRequest, query: string): NativeSearchPlan;
