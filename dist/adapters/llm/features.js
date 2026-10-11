export function featureOptions(req) {
    const body = {};
    const deepseek = req.reasoningMode === 'deepseek' ||
        ((!req.reasoningMode || req.reasoningMode === 'auto') && new URL(req.baseUrl).hostname === 'api.deepseek.com');
    const off = req.reasoningEnabled === false || req.reasoningEffort === 'off';
    const enabled = !off && (req.reasoningEnabled === true || Boolean(req.reasoningEffort && req.reasoningEffort !== 'auto'));
    let effort = off ? 'none' : !req.reasoningEffort || req.reasoningEffort === 'auto' ? (deepseek ? 'high' : 'medium') : req.reasoningEffort;
    if (!off && !enabled)
        return { body };
    if (deepseek) {
        effort = { minimal: 'low', medium: 'high', xhigh: 'high' }[effort] ?? effort;
        if (!['none', 'low', 'high', 'max'].includes(effort))
            return { body, error: 'DeepSeek 思考强度支持 off、low、high、max 或 auto。' };
        if (req.protocol === 'openai-chat-completions') {
            body.thinking = { type: off ? 'disabled' : 'enabled' };
            if (!off)
                body.reasoning_effort = effort;
        }
        else if (req.protocol === 'openai-responses')
            body.reasoning = { effort };
        else {
            body.thinking = { type: off ? 'disabled' : 'enabled' };
            if (!off)
                body.output_config = { effort };
        }
    }
    else if (req.protocol === 'openai-responses')
        body.reasoning = { effort };
    else if (req.protocol === 'openai-chat-completions')
        body.reasoning_effort = effort;
    else {
        if (off)
            body.thinking = { type: 'disabled' };
        else if (req.reasoningMode === 'anthropic-adaptive') {
            if (!['low', 'medium', 'high', 'max'].includes(effort))
                return { body, error: '自适应推理支持 low、medium、high、max 或 auto。' };
            body.thinking = { type: 'adaptive' };
            body.output_config = { effort };
        }
        else {
            const budget = { minimal: 1024, low: 1024, medium: 4096, high: 8192, xhigh: 16384, max: 32768 }[effort] ?? 4096;
            const maxTokens = req.maxTokens ?? 8192;
            if (maxTokens <= 1024)
                return { body, error: 'Messages 推理需要最大输出大于 1024 token；请增加模型最大输出。' };
            body.thinking = { type: 'enabled', budget_tokens: Math.min(budget, maxTokens - 1) };
            return { body, maxTokens };
        }
    }
    return { body };
}
//# sourceMappingURL=features.js.map