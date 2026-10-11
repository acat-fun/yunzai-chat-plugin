import type { PluginConfig } from '../../contracts/types.js';
import type { ConfigRepository } from '../../application/ports/index.js';
export declare class RevisionConflictError extends Error {
    readonly code = "REVISION_CONFLICT";
    constructor();
}
export declare class YamlConfigStore implements ConfigRepository {
    private readonly files;
    private snapshot;
    private listeners;
    subscribe(listener: (config: PluginConfig) => void): () => void;
    private writes;
    constructor(files?: {
        runtimeConfig: string;
        defaultsConfig: string;
    });
    load(): Promise<PluginConfig>;
    get(): PluginConfig;
    save(next: PluginConfig, expectedRevision?: string): Promise<PluginConfig>;
}
