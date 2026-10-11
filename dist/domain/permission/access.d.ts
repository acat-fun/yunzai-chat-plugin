import type { ChatRole, IncomingMessage, PluginConfig } from '../../contracts/types.js';
export declare function resolveRole(config: PluginConfig, msg: IncomingMessage): ChatRole;
export declare function canChat(config: PluginConfig, userId: string): {
    allowed: boolean;
    reason: string;
};
export declare function isOwner(config: PluginConfig, userId: string, platform: string): boolean;
