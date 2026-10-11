/** 有界 FIFO 调度：会话串行，全局并行；排队也受总时限约束。 */
export class ChatScheduler {
    active = 0;
    sessions = new Set();
    pending = [];
    seen = new Map();
    rates = new Map();
    async run(options, work) {
        const now = Date.now();
        for (const [id, until] of this.seen)
            if (until < now)
                this.seen.delete(id);
        for (const [id, times] of this.rates)
            if (!times.some((t) => t > now - 60000))
                this.rates.delete(id);
        if (options.identity && this.seen.has(options.identity))
            return undefined;
        const check = (id, limit) => {
            const times = (this.rates.get(id) ?? []).filter((t) => t > now - 60000);
            if (times.length >= limit)
                throw new Error('请求过于频繁，请稍后再试');
            return times;
        };
        const global = check('*', options.globalLimit), user = check(options.user, options.userLimit);
        if (this.pending.length >= 128 ||
            this.pending.filter((p) => p.key === options.key).length >=
                options.pendingLimit)
            throw new Error('聊天队列已满，请稍后再试');
        options.signal.throwIfAborted();
        this.rates.set('*', [...global, now]);
        this.rates.set(options.user, [...user, now]);
        if (options.identity) {
            if (this.seen.size >= 10000) {
                const completed = [...this.seen].find(([, until]) => until !== Infinity);
                if (completed)
                    this.seen.delete(completed[0]);
                else
                    throw new Error('聊天去重队列已满');
            }
            this.seen.set(options.identity, Infinity);
        }
        return new Promise((resolve, reject) => {
            const item = {
                key: options.key,
                signal: options.signal,
                reject,
                cleanup: () => { },
                run: () => {
                    this.active++;
                    this.sessions.add(options.key);
                    item.cleanup();
                    void work()
                        .then((value) => {
                        if (options.identity)
                            this.seen.set(options.identity, Date.now() + 300000);
                        resolve(value);
                    }, (error) => {
                        if (options.identity)
                            this.seen.delete(options.identity);
                        reject(error);
                    })
                        .finally(() => {
                        this.active--;
                        this.sessions.delete(options.key);
                        this.drain(options.concurrency);
                    });
                },
            };
            const abort = () => {
                const index = this.pending.indexOf(item);
                if (index >= 0) {
                    this.pending.splice(index, 1);
                    item.cleanup();
                    if (options.identity)
                        this.seen.delete(options.identity);
                    reject(new Error('聊天请求已取消或超时'));
                }
            };
            item.cleanup = () => options.signal.removeEventListener('abort', abort);
            options.signal.addEventListener('abort', abort, { once: true });
            this.pending.push(item);
            this.drain(options.concurrency);
        });
    }
    drain(concurrency) {
        while (this.active < concurrency) {
            const index = this.pending.findIndex((p) => !this.sessions.has(p.key));
            if (index < 0)
                return;
            const item = this.pending.splice(index, 1)[0];
            if (item.signal.aborted) {
                item.cleanup();
                item.reject(new Error('聊天请求已取消'));
            }
            else
                item.run();
        }
    }
}
//# sourceMappingURL=scheduler.js.map