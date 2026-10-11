import { WebError } from '../../contracts/web.js';
import { createWebTools } from './web-tools.js';
export { webTools } from './web-tools.js';
export function runWebAgent(options) {
    return runToolAgent({
        ...options,
        registry: createWebTools(options.web, options.config),
    });
}
/** 通用工具图节点：与搜索实现无关，可复用于其他已授权工具。 */
export async function runToolAgent(options) {
    const { model, registry, config, signal } = options;
    const turns = [];
    let pending;
    const ids = new Set();
    let callsUsed = 0, rounds = 0, remainingBytes = options.toolBytes;
    try {
        return await options.agent.run(async () => {
            signal.throwIfAborted();
            const toolsEnabled = rounds < config.maxToolRounds &&
                callsUsed < config.maxToolCalls &&
                remainingBytes >= 1024;
            const step = await model.next(turns, toolsEnabled, signal);
            signal.throwIfAborted();
            if (!step.ok)
                return step;
            if (!step.calls.length) {
                if (!step.text.trim())
                    return {
                        ok: false,
                        code: 'EMPTY_CONTENT',
                        message: '模型返回空内容',
                    };
                return { ok: true, text: step.text.trim() };
            }
            if (!toolsEnabled)
                return {
                    ok: false,
                    code: 'WEB_BUDGET_EXCEEDED',
                    message: '模型在联网预算耗尽后仍请求工具',
                };
            if (step.calls.length > 16)
                return {
                    ok: false,
                    code: 'WEB_BUDGET_EXCEEDED',
                    message: '模型单轮工具调用数量超限',
                };
            pending = step;
            return undefined;
        }, signal, config.maxToolRounds * 2 + 6, async () => {
            const step = pending;
            pending = undefined;
            rounds++;
            turns.push({
                kind: 'assistant',
                calls: step.calls,
                replay: step.replay,
            });
            const results = [];
            for (let index = 0; index < step.calls.length; index++) {
                const call = step.calls[index];
                signal.throwIfAborted();
                if (ids.has(call.id))
                    return {
                        ok: false,
                        code: 'INVALID_TOOL_CALL',
                        message: '模型重复使用工具调用 ID',
                    };
                ids.add(call.id);
                let output, error = false;
                const allowance = Math.min(remainingBytes - (step.calls.length - index) * 256, Math.floor(remainingBytes / (step.calls.length - index)));
                try {
                    if (++callsUsed > config.maxToolCalls || allowance < 512)
                        throw new WebError('WEB_BUDGET_EXCEEDED', '联网工具预算已耗尽');
                    if (!registry.has(call.name))
                        throw new WebError('WEB_UNKNOWN_TOOL', '未注册的工具');
                    output = await registry.execute(call, { signal, allowance });
                }
                catch (cause) {
                    signal.throwIfAborted();
                    error = true;
                    output = {
                        error: {
                            code: cause instanceof WebError ? cause.code : 'WEB_TOOL_FAILED',
                            message: cause instanceof WebError
                                ? cause.message
                                : '联网工具执行失败',
                        },
                    };
                }
                let content = JSON.stringify(output);
                if (Buffer.byteLength(content) > Math.max(allowance, 256)) {
                    content = JSON.stringify({
                        error: {
                            code: 'WEB_BUDGET_EXCEEDED',
                            message: '工具结果超过剩余上下文预算',
                        },
                    });
                    error = true;
                }
                remainingBytes -= Buffer.byteLength(content) + 128;
                results.push({ id: call.id, content, error });
            }
            turns.push({ kind: 'results', results });
            return undefined;
        });
    }
    catch {
        return {
            ok: false,
            code: signal.aborted ? 'CANCELLED' : 'WEB_AGENT_FAILED',
            message: signal.aborted ? '联网请求已取消或超时' : '联网请求失败',
        };
    }
}
//# sourceMappingURL=agent-loop.js.map