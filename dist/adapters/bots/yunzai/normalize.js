const record = (value) => value && typeof value === 'object' ? value : {};
/** 只从消息文本段取正文，@ 展示名和 CQ 标签不进入模型。 */
export function normalizeYunzaiEvent(e) {
    const botAccountId = String(e.self_id ?? e.bot?.uin ?? '');
    const userId = String(e.user_id ?? '');
    const isGroup = Boolean(e.isGroup || e.message_type === 'group');
    const conversationId = isGroup ? String(e.group_id ?? '') : userId;
    const segments = (Array.isArray(e.message) ? e.message : []).map(record);
    const textSegments = segments.filter(seg => seg.type === 'text');
    const rawText = (segments.length
        ? textSegments.map(seg => String(seg.text ?? record(seg.data).text ?? '')).join('')
        : String(e.msg ?? e.raw_message ?? '')).trim();
    const parts = [{ type: 'text', text: rawText }];
    for (const seg of segments.filter(seg => seg.type === 'image')) {
        const data = record(seg.data);
        const url = seg.url ?? data.url ?? seg.file ?? data.file;
        parts.push({ type: 'image', ...(typeof url === 'string' ? { url } : {}) });
    }
    if (!segments.some(seg => seg.type === 'image')) {
        for (const url of e.img ?? [])
            if (typeof url === 'string')
                parts.push({ type: 'image', url });
    }
    const atBot = Boolean(e.atBot || e.atme || segments.some(seg => seg.type === 'at' && botAccountId !== '' && String(seg.qq ?? record(seg.data).qq) === botAccountId));
    const timestamp = Number(e.time) * 1000;
    const occurredAt = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date();
    return {
        eventId: String(e.message_id ?? e.seq ?? `${Date.now()}-${userId}`),
        messageId: String(e.message_id ?? ''),
        conversation: {
            adapterId: 'yunzai',
            platform: 'qq',
            botAccountId,
            kind: isGroup ? 'group' : 'private',
            conversationId,
        },
        sender: {
            platform: 'qq',
            userId,
            botAccountId,
        },
        occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date().toISOString() : occurredAt.toISOString(),
        receivedAt: new Date().toISOString(),
        parts,
        isFromSelf: String(e.user_id) === botAccountId || Boolean(e.isSelf),
        isAtBot: atBot,
        isHostMaster: e.isMaster === true,
        rawText,
    };
}
/** 引用内容属于正文附件，绝不能替换命令或触发规则使用的 rawText。 */
export async function enrichYunzaiReply(e, msg) {
    if (!msg.rawText.trim())
        return msg;
    let source = record(e.source);
    if (!Array.isArray(source.message) && e.getReply) {
        try {
            source = record(await e.getReply());
        }
        catch {
            return msg;
        }
    }
    if (!Array.isArray(source.message))
        return msg;
    const quoted = normalizeYunzaiEvent({ message: source.message });
    const images = quoted.parts.filter(part => part.type === 'image');
    if (!images.length)
        return msg;
    return { ...msg, parts: [...msg.parts, ...images,
            ...(quoted.rawText ? [{ type: 'text', text: `引用消息：${quoted.rawText}` }] : [])] };
}
//# sourceMappingURL=normalize.js.map