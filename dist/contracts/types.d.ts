import type { WebConfig } from './web.js';
export type ProtocolId = 'openai-responses' | 'openai-chat-completions' | 'anthropic-messages';
export type Identity = {
    platform: string;
    userId: string;
    name?: string;
    botAccountId?: string;
};
export type ConversationRef = {
    adapterId: string;
    platform: string;
    botAccountId: string;
    kind: 'private' | 'group';
    conversationId: string;
};
export type MessagePart = {
    type: 'text';
    text: string;
} | {
    type: 'image';
    url?: string;
    mimeType?: string;
} | {
    type: 'file';
    name: string;
    mimeType?: string;
};
export type IncomingMessage = {
    eventId: string;
    messageId: string;
    conversation: ConversationRef;
    sender: Identity;
    occurredAt: string;
    receivedAt: string;
    parts: MessagePart[];
    isFromSelf: boolean;
    isAtBot: boolean;
    isHostMaster?: boolean;
    rawText: string;
};
export type ModelConfig = {
    id: string;
    displayName: string;
    contextWindowTokens?: number;
    maxOutputTokens?: number;
    toolCalling?: boolean;
    inputTypes: Array<'text' | 'image' | 'file'>;
    reasoningEnabled?: boolean;
    reasoningMode?: 'auto' | 'deepseek' | 'anthropic-adaptive';
};
export type ProviderConfig = {
    id: string;
    displayName: string;
    enabled: boolean;
    baseUrl: string;
    protocol: ProtocolId;
    auth: {
        mode: 'api-key' | 'none';
        secretRef: string;
        maskedHint: string;
    };
    models: ModelConfig[];
};
export type PromptConfig = {
    id: string;
    name: string;
    enabled: boolean;
    content: string;
};
export type DefaultsConfig = {
    route: string;
    fallbackRoutes: string[];
    prompt: string;
    regex: string;
    alwaysPrivate: boolean;
    reasoning: string;
    webEnabled: boolean;
    replyImages: boolean;
    replyFiles: boolean;
    contextCount: number;
    contextAgeMinutes: number;
    groupRandom: boolean;
    replyProbability: number;
};
export type PolicyConfig = {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    bindUsers: string[];
    whitelistUsers: string[];
    blacklistUsers: string[];
    kind: 'all' | 'private' | 'group';
    groupIds: string[];
    overrides: Partial<DefaultsConfig>;
};
export type AdminEntry = {
    id: string;
    enabled: boolean;
    userId: string;
    name: string;
    kind: 'all' | 'private' | 'group';
    groupIds: string[];
    blacklistUsers: string[];
};
export type PluginConfig = {
    schemaVersion: number;
    revision: string;
    plugin: {
        enabled: boolean;
    };
    admin: {
        mode: 'guoba' | 'standalone';
        guoba: {
            enabled: boolean;
            trustHostAdministrators: boolean;
        };
        standalone: {
            enabled: boolean;
            host: string;
            port: number;
            auth: {
                mode: 'owner-password';
                passwordSecretRef: string;
            };
        };
    };
    web: WebConfig;
    providers: ProviderConfig[];
    prompts: PromptConfig[];
    defaults: DefaultsConfig;
    policies: PolicyConfig[];
    access: {
        owner: Identity;
        admins: AdminEntry[];
        chatWhitelist: string[];
        chatBlacklist: string[];
    };
    runtime: {
        queue: {
            maxPendingPerSession: number;
            maxConcurrentGlobal: number;
        };
        limits: {
            perUserRequestsPerMinute: number;
            globalRequestsPerMinute: number;
        };
        llm: {
            requestTimeoutSeconds: number;
            maxAttempts: number;
        };
        context: {
            storage: 'memory';
            cacheTtlSeconds: number;
        };
    };
};
export type ChatRole = 'owner' | 'admin' | 'member';
export type EffectiveSettings = DefaultsConfig & {
    systemPrompt: string;
    providerId: string;
    modelId: string;
    sources: Record<string, string>;
};
