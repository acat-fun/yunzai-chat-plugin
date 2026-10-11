import type { GenerationRequest, GenerationResult } from '../../application/ports/index.js';
export declare function createChatCompletion(req: GenerationRequest, send?: typeof fetch): Promise<GenerationResult>;
