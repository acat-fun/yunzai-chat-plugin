import type { ToolCall } from '../ports/web.js';
export type ToolContext = {
    signal: AbortSignal;
    allowance: number;
};
export type AgentTool = {
    name: string;
    execute(argumentsValue: unknown, context: ToolContext): Promise<unknown>;
};
/** 工具只能经当前请求注册表执行，未注册能力不会被模型调用开启。 */
export declare class ToolRegistry {
    private readonly tools;
    register(tool: AgentTool): this;
    has(name: string): boolean;
    execute(call: ToolCall, context: ToolContext): Promise<unknown>;
}
