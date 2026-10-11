import type { GenerationRequest } from '../../application/ports/index.js';
import type { AgentStep, AgentTurn } from '../../application/ports/web.js';
export declare function nextToolGeneration(req: GenerationRequest, turns: AgentTurn[], enabled: boolean, signal: AbortSignal, send?: typeof fetch): Promise<AgentStep>;
