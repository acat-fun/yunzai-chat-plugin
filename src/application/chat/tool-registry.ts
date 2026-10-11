import type { ToolCall } from '../ports/web.js';
export type ToolContext = { signal: AbortSignal; allowance: number };
export type AgentTool = {
  name: string;
  execute(argumentsValue: unknown, context: ToolContext): Promise<unknown>;
};
/** 工具只能经当前请求注册表执行，未注册能力不会被模型调用开启。 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();
  register(tool: AgentTool): this {
    if (this.tools.has(tool.name)) throw new Error('重复注册工具');
    this.tools.set(tool.name, tool);
    return this;
  }
  has(name: string): boolean {
    return this.tools.has(name);
  }
  async execute(call: ToolCall, context: ToolContext): Promise<unknown> {
    context.signal.throwIfAborted();
    const tool = this.tools.get(call.name);
    if (!tool) throw new Error('未注册的工具');
    return tool.execute(call.arguments, context);
  }
}
