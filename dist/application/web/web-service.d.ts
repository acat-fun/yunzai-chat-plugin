/** 主模型、搜索与抓取共用有界并发队列，排队遵守请求取消。 */
export declare class WebQueue {
    private active;
    private counts;
    private waiting;
    run<T>(key: string, signal: AbortSignal, work: () => Promise<T>): Promise<T>;
    private drain;
}
