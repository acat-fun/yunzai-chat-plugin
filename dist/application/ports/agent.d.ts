import type { GenerationResult } from './index.js';
/** 框架负责节点推进；业务节点负责协议、工具权限与预算。 */
export interface AgentPort {
    run(step: () => Promise<GenerationResult | undefined>, signal: AbortSignal, recursionLimit: number, tools?: () => Promise<GenerationResult | undefined>): Promise<GenerationResult>;
}
