import type { ChatRole, IncomingMessage, PluginConfig } from '../../contracts/types.js';

export function resolveRole(config: PluginConfig, msg: IncomingMessage): ChatRole {
  const userId = msg.sender.userId;
  if (isOwner(config, userId, msg.sender.platform)) return 'owner';
  if (msg.sender.platform !== config.access.owner.platform) return 'member';
  const hit = config.access.admins.find((admin) => {
    if (!admin.enabled || admin.userId !== userId) return false;
    if (admin.blacklistUsers.includes(userId)) return false;
    if (admin.kind === 'private' && msg.conversation.kind !== 'private') return false;
    if (admin.kind === 'group') {
      if (msg.conversation.kind !== 'group') return false;
      if (admin.groupIds.length && !admin.groupIds.includes(msg.conversation.conversationId)) {
        return false;
      }
    }
    return true;
  });
  return hit ? 'admin' : 'member';
}

export function canChat(config: PluginConfig, userId: string): { allowed: boolean; reason: string } {
  if (!config.plugin.enabled) return { allowed: false, reason: '全局已关闭' };
  if (config.access.chatBlacklist.includes(userId)) {
    return { allowed: false, reason: '黑名单拒绝' };
  }
  const white = config.access.chatWhitelist;
  if (white.length && !white.includes(userId)) {
    return { allowed: false, reason: '未在白名单' };
  }
  return { allowed: true, reason: '' };
}

export function isOwner(config: PluginConfig, userId: string, platform: string): boolean {
  return Boolean(config.access.owner.userId) && config.access.owner.userId === userId && config.access.owner.platform === platform;
}
