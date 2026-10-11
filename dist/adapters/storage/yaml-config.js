import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { validateConfig } from '../../contracts/config-schema.js';
import { paths } from './paths.js';
import { removeLegacyWebConfig } from './legacy-web-config.js';
import { migrateLegacyDisplayMetadata } from './legacy-display-metadata.js';
export class RevisionConflictError extends Error {
    code = 'REVISION_CONFLICT';
    constructor() { super('配置已更新，请刷新后重试'); }
}
export class YamlConfigStore {
    files;
    snapshot = null;
    listeners = new Set();
    subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    writes = Promise.resolve();
    constructor(files = { runtimeConfig: paths.runtimeConfig, defaultsConfig: paths.defaultsConfig }) {
        this.files = files;
    }
    async load() {
        let rawText;
        let missing = false;
        try {
            rawText = await fs.readFile(this.files.runtimeConfig, 'utf8');
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
            rawText = await fs.readFile(this.files.defaultsConfig, 'utf8');
            missing = true;
        }
        if (Buffer.byteLength(rawText) > 1024 * 1024)
            throw new Error('配置文件超过 1 MiB');
        const config = validateConfig(removeLegacyWebConfig(migrateLegacyDisplayMetadata(YAML.parse(rawText, { maxAliasCount: 0 }))));
        if (missing) {
            await fs.mkdir(path.dirname(this.files.runtimeConfig), { recursive: true });
            await fs.writeFile(this.files.runtimeConfig, YAML.stringify(config), { encoding: 'utf8', flag: 'wx' });
        }
        this.snapshot = config;
        return this.get();
    }
    get() {
        if (!this.snapshot)
            throw new Error('配置尚未加载');
        return structuredClone(this.snapshot);
    }
    save(next, expectedRevision = next.revision) {
        // 入队时取得副本，避免调用方在排队期间修改候选值。
        const candidate = structuredClone(next);
        const task = this.writes.then(async () => {
            if (this.get().revision !== expectedRevision)
                throw new RevisionConflictError();
            const config = validateConfig({ ...candidate, revision: `r-${randomUUID()}` });
            const text = YAML.stringify(config);
            if (Buffer.byteLength(text) > 1024 * 1024)
                throw new Error('配置文件超过 1 MiB');
            const temp = `${this.files.runtimeConfig}.${randomUUID()}.tmp`;
            try {
                await fs.writeFile(temp, text, 'utf8');
                await fs.rename(temp, this.files.runtimeConfig);
                this.snapshot = config;
                for (const listener of this.listeners)
                    listener(this.get());
            }
            finally {
                await fs.rm(temp, { force: true });
            }
            return this.get();
        });
        this.writes = task.catch(() => undefined);
        return task;
    }
}
//# sourceMappingURL=yaml-config.js.map