import type { PluginConfig } from '../../contracts/types.js';
import type { WebConfig, WebProviderConfig } from '../../contracts/web.js';
import type { ConfigRepository, SecretRepository } from '../ports/index.js';
export declare function publicWebConfig(web: WebConfig): {
    providers: {
        auth: {
            configured: boolean;
            maskedHint: string;
        };
        id: string;
        type: "deepseek-native" | "exa" | "perplexity" | "searxng";
        enabled: boolean;
        baseUrl: string;
        model?: string;
        maxUses: number;
    }[];
    engineOrder: import("../../contracts/web.js").SearchEngine[];
    enabled: boolean;
    searchProviderId: string;
    searchTimeoutSeconds: number;
    fetchTimeoutSeconds: number;
    maxFetchChars: number;
    maxToolCalls: number;
    maxToolRounds: number;
    agentTimeoutSeconds: number;
};
export type WebSecretUpdate = {
    id: string;
    value: string;
    provider: WebProviderConfig;
};
/** 三管理入口共用秘密保留/替换/清除规则，外部不能写入任意 secretRef。 */
export declare function prepareWebPatch(current: WebConfig, input: unknown): {
    web: WebConfig;
    updates: WebSecretUpdate[];
};
export declare function saveWebConfig(options: {
    repository: ConfigRepository;
    secrets: SecretRepository;
    expectedRevision: string;
    patch: unknown;
    webEnabled?: boolean;
}): Promise<PluginConfig>;
/** 锅巴只在明确授权宿主管理者时提供联网配置，不从请求字段猜测主人身份。 */
export declare function assertGuobaWebAccess(config: PluginConfig): void;
