import { WebError } from '../../contracts/web.js';

/** 主模型、搜索与抓取共用有界并发队列，排队遵守请求取消。 */
export class WebQueue {
  private active = 0;
  private counts = new Map<string, number>();
  private waiting: Array<{
    key: string;
    signal: AbortSignal;
    start: () => void;
    reject: (error: Error) => void;
    cleanup: () => void;
  }> = [];
  async run<T>(
    key: string,
    signal: AbortSignal,
    work: () => Promise<T>,
  ): Promise<T> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      if (this.waiting.length >= 64) {
        reject(new WebError('WEB_BUSY', '联网请求队列已满'));
        return;
      }
      const item = {
        key,
        signal,
        start: resolve,
        reject,
        cleanup: () => signal.removeEventListener('abort', abort),
      };
      const abort = () => {
        this.waiting = this.waiting.filter((p) => p !== item);
        item.cleanup();
        reject(new WebError('CANCELLED', '联网请求已取消'));
      };
      signal.addEventListener('abort', abort, { once: true });
      this.waiting.push(item);
      this.drain();
    });
    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      this.active--;
      const count = (this.counts.get(key) ?? 1) - 1;
      if (count) this.counts.set(key, count);
      else this.counts.delete(key);
      this.drain();
    }
  }
  private drain(): void {
    for (let i = 0; i < this.waiting.length && this.active < 4; ) {
      const item = this.waiting[i]!;
      if ((this.counts.get(item.key) ?? 0) >= 2) {
        i++;
        continue;
      }
      this.waiting.splice(i, 1);
      item.cleanup();
      this.active++;
      this.counts.set(item.key, (this.counts.get(item.key) ?? 0) + 1);
      item.start();
    }
  }
}
