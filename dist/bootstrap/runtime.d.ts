import { MemoryContextStore } from '../adapters/storage/memory-context.js';
import { YamlConfigStore } from '../adapters/storage/yaml-config.js';
import type { PublicHttp } from '../adapters/web/http-fetch.js';
import type { IncomingMessage } from '../contracts/types.js';
export declare class ChatRuntime {
    private readonly builtinSearch;
    private diagnosticLogger;
    constructor(options?: {
        searchHttp?: PublicHttp;
    });
    /** 宿主桥接注入自己的日志入口，核心不依赖 Yunzai 全局 logger。 */
    setDiagnosticLogger(logger: (message: string) => void): void;
    private logWeb;
    readonly configStore: YamlConfigStore;
    readonly contextStore: MemoryContextStore;
    private readonly adminServer;
    private readonly webQueue;
    private readonly agent;
    private readonly scheduler;
    private readonly requests;
    private ready;
    private panelUrl;
    ensureLoaded(): Promise<void>;
    get pluginRoot(): string;
    getPanelUrl(): string | null;
    issuePanelLoginCode(): string;
    startPanel(): Promise<string | null>;
    stop(): Promise<void>;
    stopPanel(): Promise<void>;
    testWebSearch(providerId: string, query: string): Promise<import("../contracts/web.js").SearchResult>;
    handleMessage(msg: IncomingMessage, deliver?: (result: {
        reply?: string;
        renderMarkdown?: boolean;
    }) => Promise<void>): Promise<{
        reply?: string;
        ignoreReason?: string;
        renderMarkdown?: boolean;
    }>;
}
export declare function getRuntime(): ChatRuntime;
