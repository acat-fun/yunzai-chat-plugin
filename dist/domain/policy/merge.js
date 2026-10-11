function policyMatches(policy, msg) {
    if (!policy.enabled)
        return false;
    if (policy.kind !== 'all' && policy.kind !== msg.conversation.kind)
        return false;
    if (msg.conversation.kind === 'group' &&
        policy.groupIds.length &&
        !policy.groupIds.includes(msg.conversation.conversationId)) {
        return false;
    }
    const userId = msg.sender.userId;
    if (policy.blacklistUsers.includes(userId))
        return false;
    if (policy.bindUsers.length && !policy.bindUsers.includes(userId))
        return false;
    if (policy.whitelistUsers.length && !policy.whitelistUsers.includes(userId))
        return false;
    return true;
}
function narrowScore(policy) {
    if (policy.bindUsers.length)
        return 2;
    if (policy.whitelistUsers.length)
        return 1;
    return 0;
}
export function resolveEffective(config, msg) {
    const matched = config.policies
        .filter((policy) => policyMatches(policy, msg))
        .sort((a, b) => a.priority - b.priority ||
        narrowScore(a) - narrowScore(b) ||
        a.id.localeCompare(b.id));
    const effective = { ...config.defaults };
    const sources = {};
    for (const policy of matched) {
        for (const [key, value] of Object.entries(policy.overrides)) {
            if (value === undefined)
                continue;
            effective[key] = value;
            sources[key] = policy.name;
        }
    }
    const separator = effective.route.indexOf('|');
    const providerId = effective.route.slice(0, separator);
    const modelId = effective.route.slice(separator + 1);
    const prompt = config.prompts.find((item) => item.id === effective.prompt && item.enabled)?.content ??
        '你是一个简洁、友好的聊天助手。';
    return {
        ...effective,
        systemPrompt: prompt,
        providerId,
        modelId,
        sources,
    };
}
//# sourceMappingURL=merge.js.map