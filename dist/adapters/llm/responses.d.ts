import type { GenerationRequest, GenerationResult } from '../../application/ports/index.js';
export declare function createResponse(req: GenerationRequest, send?: typeof fetch): Promise<GenerationResult>;
