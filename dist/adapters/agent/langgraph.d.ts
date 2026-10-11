import type { AgentPort } from '../../application/ports/agent.js';
import type { GenerationResult } from '../../application/ports/index.js';
/** 每次运行独立图状态，不使用全局检查点保存用户数据或 API 密钥。 */
export declare class LangGraphAgent implements AgentPort {
    run(step: () => Promise<GenerationResult | undefined>, signal: AbortSignal, recursionLimit: number, tools?: () => Promise<GenerationResult | undefined>): Promise<GenerationResult>;
}
