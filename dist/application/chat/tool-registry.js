/** 工具只能经当前请求注册表执行，未注册能力不会被模型调用开启。 */
export class ToolRegistry {
    tools = new Map();
    register(tool) {
        if (this.tools.has(tool.name))
            throw new Error('重复注册工具');
        this.tools.set(tool.name, tool);
        return this;
    }
    has(name) {
        return this.tools.has(name);
    }
    async execute(call, context) {
        context.signal.throwIfAborted();
        const tool = this.tools.get(call.name);
        if (!tool)
            throw new Error('未注册的工具');
        return tool.execute(call.arguments, context);
    }
}
//# sourceMappingURL=tool-registry.js.map