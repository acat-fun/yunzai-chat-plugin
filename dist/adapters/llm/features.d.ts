import type { GenerationRequest } from '../../application/ports/index.js';
export declare function featureOptions(req: GenerationRequest): {
    body: Record<string, unknown>;
    maxTokens?: number;
    error?: string;
};
