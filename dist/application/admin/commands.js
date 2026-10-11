import { isOwner } from '../../domain/permission/access.js';
import { setConfigValue } from './set-config.js';
import { getHelpText } from './help.js';
function parseArgs(text) {
    const matched = text.match(/"([^"]*)"|'([^']*)'|\S+/g) ?? [];
    return matched.map((part) => part.replace(/^["']|["']$/g, ''));
}
export async function tryHandleCommand(options) {
    const { configStore, msg } = options;
    const text = msg.rawText.trim();
    if (!text.startsWith('#chat'))
        return { handled: false };
    const body = text.slice('#chat'.length);
    if (!body || body.startsWith(' ') || body.startsWith('对话')) {
        // `#chat 文本` / `#chat对话` 交给聊天用例
        return { handled: false };
    }
    const config = configStore.get();
    const ownerConfigured = Boolean(config.access.owner.userId);
    const asOwner = isOwner(config, msg.sender.userId, msg.sender.platform);
    const commandToken = body.split(/\s+/, 1)[0] ?? '';
    const rest = body.slice(commandToken.length).trim();
    const args = parseArgs(rest);
    if (commandToken === '帮助') {
        return {
            handled: true,
            reply: getHelpText(),
        };
    }
    if (commandToken === '状态') {
        const provider = config.providers.find((item) => item.id === config.defaults.route.split('|')[0]);
        return {
            handled: true,
            reply: [
                `版本 ${config.revision}`,
                `聊天：${config.plugin.enabled ? '开启' : '关闭'}`,
                `默认路由：${config.defaults.route || '未设置'}`,
                ...(asOwner && msg.conversation.kind === 'private' ? [
                    `主人：${config.access.owner.userId}`,
                    `密钥：${provider?.auth.maskedHint || (provider?.auth.secretRef ? '已配置' : '未配置')}`,
                    `白名单：${config.access.chatWhitelist.join(',') || '不限制'}`,
                    `黑名单：${config.access.chatBlacklist.join(',') || '无'}`,
                ] : []),
            ].join('\n'),
        };
    }
    if (commandToken === '设置主人') {
        const userId = args[0] || msg.sender.userId;
        if (!userId)
            return { handled: true, reply: '用法：#chat设置主人 <QQ>' };
        if (msg.conversation.kind !== 'private') {
            return { handled: true, reply: '设置主人请在私聊中操作。' };
        }
        if (ownerConfigured && !asOwner) {
            return { handled: true, reply: '仅主人可更换主人。' };
        }
        if (!ownerConfigured && msg.isHostMaster !== true) {
            return { handled: true, reply: '首次设置主人需由宿主主人在私聊中操作，或在本地 YML 设置 access.owner。' };
        }
        config.access.owner = { platform: msg.sender.platform, userId };
        await configStore.save(config);
        return {
            handled: true,
            reply: ownerConfigured ? `主人已更换为 ${userId}` : `已初始化主人 ${userId}`,
        };
    }
    if (!asOwner) {
        if (['设置', '设置搜索密钥', '清除搜索密钥', '设置密钥', '设置默认模型', '设置白名单', '设置黑名单', '开', '关'].includes(commandToken)) {
            return {
                handled: true,
                reply: ownerConfigured
                    ? '仅主人可执行该命令。'
                    : '尚未设置主人。请先私聊发送：#chat设置主人',
            };
        }
        return { handled: true, reply: '未知命令或无权执行。发送 #chat帮助 查看可用命令。' };
    }
    if (commandToken === '设置') {
        if (msg.conversation.kind !== 'private')
            return { handled: true, reply: '通用配置命令请在私聊中操作。' };
        if (Buffer.byteLength(text) > 16 * 1024)
            return { handled: true, reply: '配置命令超过 16 KiB。' };
        try {
            const next = setConfigValue(config, rest);
            await configStore.save(next);
            return { handled: true, reply: /^面板\s/.test(rest)
                    ? '面板配置已校验并写入 YML；监听设置在重启 Yunzai 后生效。Docker 还需配置端口映射。'
                    : '配置已校验并写入 YML。' };
        }
        catch (error) {
            return { handled: true, reply: `配置未保存：${error instanceof Error ? error.message : '配置无效'}` };
        }
    }
    if (commandToken === '开' || commandToken === '关') {
        config.plugin.enabled = commandToken === '开';
        await configStore.save(config);
        return { handled: true, reply: `已${commandToken === '开' ? '开启' : '关闭'}自动聊天，并写入 YML。` };
    }
    if (commandToken === '设置搜索密钥' || commandToken === '清除搜索密钥') {
        if (msg.conversation.kind !== 'private')
            return { handled: true, reply: '搜索密钥命令仅限主人私聊。' };
        const provider = config.web.providers.find(p => p.id === args[0]);
        if (!provider)
            return { handled: true, reply: '搜索后端不存在。' };
        if (commandToken === '清除搜索密钥') {
            provider.auth = { secretRef: '', maskedHint: '' };
        }
        else {
            if (!args[1] || args[1].length > 4096)
                return { handled: true, reply: '用法：#chat设置搜索密钥 <后端ID> <密钥>' };
            const saved = await options.secrets.replace(`web-${provider.id}-${Date.now()}`, args[1]);
            provider.auth = { secretRef: saved.ref, maskedHint: saved.maskedHint };
        }
        await configStore.save(config, config.revision);
        return { handled: true, reply: '搜索密钥已更新并写入 YML，完整密钥不回显。' };
    }
    if (commandToken === '设置密钥') {
        const providerId = args[0];
        const secret = args[1];
        if (!providerId || !secret) {
            return { handled: true, reply: '用法：#chat设置密钥 <提供商ID> <密钥>（请私聊）' };
        }
        if (msg.conversation.kind !== 'private') {
            return { handled: true, reply: '密钥命令仅限私聊。' };
        }
        const provider = config.providers.find((item) => item.id === providerId);
        if (!provider)
            return { handled: true, reply: `找不到提供商 ${providerId}` };
        const saved = await options.secrets.replace(`provider-${providerId}-${Date.now()}`, secret);
        provider.auth.secretRef = saved.ref;
        provider.auth.maskedHint = saved.maskedHint;
        await configStore.save(config);
        return {
            handled: true,
            reply: `已保存密钥（脱敏：${saved.maskedHint}），完整 token 不会写入配置回显。`,
        };
    }
    if (commandToken === '设置默认模型') {
        const providerId = args[0];
        const modelId = args[1];
        if (!providerId || !modelId) {
            return { handled: true, reply: '用法：#chat设置默认模型 <提供商ID> <模型ID>' };
        }
        const provider = config.providers.find((item) => item.id === providerId);
        if (!provider?.models.some((model) => model.id === modelId)) {
            return { handled: true, reply: '提供商或模型不存在。' };
        }
        config.defaults.route = `${providerId}|${modelId}`;
        await configStore.save(config);
        return { handled: true, reply: `默认模型已设为 ${config.defaults.route}` };
    }
    if (commandToken === '设置白名单' || commandToken === '设置黑名单') {
        const list = (args[0] ?? '')
            .split(/[,，\s]+/)
            .map((item) => item.trim())
            .filter(Boolean);
        if (commandToken === '设置白名单')
            config.access.chatWhitelist = list;
        else
            config.access.chatBlacklist = list;
        await configStore.save(config);
        return {
            handled: true,
            reply: `${commandToken === '设置白名单' ? '白名单' : '黑名单'}已更新：${list.join(',') || '（空）'}`,
        };
    }
    return {
        handled: true,
        reply: `未知命令：#chat${commandToken}。发送 #chat帮助 查看可用命令。`,
    };
}
//# sourceMappingURL=commands.js.map