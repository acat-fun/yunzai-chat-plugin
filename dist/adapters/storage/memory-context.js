export class MemoryContextStore {
    expires = new Map();
    prune() {
        for (const [key, until] of this.expires)
            if (until <= Date.now())
                this.clear(key);
    }
    map = new Map();
    get(key, maxCount, maxAgeMinutes) {
        this.prune();
        const all = this.map.get(key) ?? [];
        const oldest = Date.now() - Math.max(0, maxAgeMinutes) * 60_000;
        const filtered = all.filter((turn) => turn.at >= oldest && turn.role !== 'system');
        if (maxCount <= 0)
            return [];
        const selected = filtered.slice(-maxCount);
        while (selected[0]?.role === 'assistant')
            selected.shift();
        return structuredClone(selected);
    }
    append(key, user, assistant, ttlSeconds) {
        this.prune();
        const now = Date.now();
        this.expires.set(key, now + Math.max(60, ttlSeconds) * 1000);
        const list = this.map.get(key) ?? [];
        list.push({ role: 'user', content: structuredClone(user), at: now });
        if (assistant)
            list.push({ role: 'assistant', content: assistant, at: now });
        const cutoff = now - Math.max(60, ttlSeconds) * 1000;
        this.map.set(key, list.filter((turn) => turn.at >= cutoff).slice(-200));
        // 整个缓存限制总字符量，超限淘汰最早会话；聊天应用仅写入文本历史。
        let characters = [...this.map.values()].reduce((sum, turns) => sum + Buffer.byteLength(JSON.stringify(turns)), 0);
        while ((characters > 32 * 1024 * 1024 || this.map.size > 2000) &&
            this.map.size) {
            const first = this.map.keys().next().value;
            characters -= Buffer.byteLength(JSON.stringify(this.map.get(first)));
            this.clear(first);
        }
    }
    clear(key) {
        this.map.delete(key);
        this.expires.delete(key);
    }
}
//# sourceMappingURL=memory-context.js.map