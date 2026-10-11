import { WebError } from '../../contracts/web.js';
/** 原生搜索优先，但只占总预算的一部分，避免回退时已没有执行时间。 */
export async function searchWithFallback(options) {
    const expires = Date.now() + options.timeoutSeconds * 1000;
    const signal = AbortSignal.any([
        options.signal,
        AbortSignal.timeout(Math.max(1, Math.floor(options.timeoutSeconds * 1000))),
    ]);
    const active = () => {
        options.signal.throwIfAborted();
        if (signal.aborted)
            throw new WebError('WEB_TIMEOUT', '搜索总预算已耗尽');
    };
    active();
    const nativeSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.min(10000, Math.floor((options.timeoutSeconds * 1000) / 3))),
    ]);
    let code;
    try {
        const result = await waitForAbort(() => options.native(nativeSignal), nativeSignal);
        active();
        nativeSignal.throwIfAborted();
        if (result.sources.length)
            return { ...result, engine: 'model-native', failures: [] };
        code = 'WEB_NO_RESULTS';
    }
    catch (cause) {
        active();
        code = nativeSignal.aborted
            ? 'WEB_TIMEOUT'
            : cause instanceof WebError
                ? cause.code
                : 'WEB_SEARCH_FAILED';
    }
    active();
    options.onFallback?.(code);
    const remainingSeconds = Math.max(1, expires - Date.now()) / 1000;
    try {
        const result = await waitForAbort(() => options.builtin(signal, remainingSeconds), signal);
        active();
        return {
            ...result,
            failures: [{ engine: 'model-native', code }, ...(result.failures ?? [])],
        };
    }
    catch (cause) {
        active();
        throw cause;
    }
}
/** 即使适配器迟迟没有结束，取消也不会继续等结果或启动后续回退。 */
async function waitForAbort(work, signal) {
    let cleanup = () => { };
    try {
        signal.throwIfAborted();
        return await Promise.race([
            Promise.resolve().then(() => {
                signal.throwIfAborted();
                return work();
            }),
            new Promise((_, reject) => {
                const abort = () => reject(new WebError('CANCELLED', '搜索请求已取消或超时'));
                signal.addEventListener('abort', abort, { once: true });
                cleanup = () => signal.removeEventListener('abort', abort);
            }),
        ]);
    }
    finally {
        cleanup();
    }
}
//# sourceMappingURL=search-service.js.map