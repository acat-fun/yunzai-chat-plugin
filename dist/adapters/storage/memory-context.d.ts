import type { ChatContent, ChatTurn } from '../../application/ports/index.js';
export declare class MemoryContextStore {
    private readonly expires;
    private prune;
    private readonly map;
    get(key: string, maxCount: number, maxAgeMinutes: number): ChatTurn[];
    append(key: string, user: ChatContent, assistant: string, ttlSeconds: number): void;
    clear(key: string): void;
}
