import type { GenerationRequest, GenerationResult } from '../../application/ports/index.js';
export type JsonResult = {
    ok: true;
    data: unknown;
} | Extract<GenerationResult, {
    ok: false;
}>;
export declare function postJson(req: GenerationRequest, endpoint: string, body: unknown, headers: Record<string, string>, send?: typeof fetch): Promise<JsonResult>;
