/** 有界 FIFO 调度：会话串行，全局并行；排队也受总时限约束。 */
export declare class ChatScheduler {
    private active;
    private sessions;
    private pending;
    private seen;
    private rates;
    run<T>(options: {
        key: string;
        identity?: string;
        user: string;
        globalLimit: number;
        userLimit: number;
        concurrency: number;
        pendingLimit: number;
        signal: AbortSignal;
    }, work: () => Promise<T>): Promise<T | undefined>;
    private drain;
}
