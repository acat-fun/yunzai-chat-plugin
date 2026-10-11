import type { ToolRegistry } from './tool-registry.js';
import type { GenerationResult } from '../ports/index.js';
import type { AgentPort } from '../ports/agent.js';
import type { AgentModelPort, WebPort } from '../ports/web.js';
import { type WebConfig } from '../../contracts/web.js';
export { webTools } from './web-tools.js';
export declare function runWebAgent(options: {
    agent: AgentPort;
    model: AgentModelPort;
    web: WebPort;
    config: WebConfig;
    signal: AbortSignal;
    toolBytes: number;
}): Promise<GenerationResult>;
/** 通用工具图节点：与搜索实现无关，可复用于其他已授权工具。 */
export declare function runToolAgent(options: {
    agent: AgentPort;
    model: AgentModelPort;
    registry: ToolRegistry;
    config: Pick<WebConfig, 'maxToolRounds' | 'maxToolCalls'>;
    signal: AbortSignal;
    toolBytes: number;
}): Promise<GenerationResult>;
