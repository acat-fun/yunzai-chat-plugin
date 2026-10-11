export function evaluateTrigger(msg, settings, randomValue) {
    const text = msg.rawText.trim();
    if (text.startsWith('#chat')) {
        return { hit: true, reason: '显式命令' };
    }
    if (msg.isAtBot) {
        return { hit: true, reason: '@机器人' };
    }
    if (settings.regex) {
        try {
            if (new RegExp(settings.regex, 'iu').test(text)) {
                return { hit: true, reason: '正则触发' };
            }
        }
        catch {
            return { hit: false, reason: '正则无效' };
        }
    }
    if (msg.conversation.kind === 'private' && settings.alwaysPrivate) {
        return { hit: true, reason: '私聊始终回复' };
    }
    if (msg.conversation.kind === 'group' && settings.groupRandom) {
        const probability = Math.min(100, Math.max(0, settings.replyProbability)) / 100;
        if (randomValue < probability) {
            return { hit: true, reason: `随机回复 ${settings.replyProbability}%` };
        }
        return { hit: false, reason: '随机未命中' };
    }
    return { hit: false, reason: '未匹配触发' };
}
//# sourceMappingURL=trigger.js.map