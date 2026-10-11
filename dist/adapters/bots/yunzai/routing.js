/** 被动聊天不抢占 Yunzai 和其他插件的命令。 */
export function acceptsPassiveChat(message) {
    return !message.isFromSelf && Boolean(message.sender.userId) &&
        Boolean(message.rawText.trim()) && !/^[#＃/!！]/u.test(message.rawText);
}
//# sourceMappingURL=routing.js.map