/** 域名优先识别厂商；网关按模型名选择扩展，但绝不把凭据转发至其他域名。 */
export function matchNativeSearch(req, query) {
    const base = new URL(req.baseUrl);
    const host = base.hostname;
    const official = host === 'api.deepseek.com'
        ? 'deepseek'
        : host === 'api.anthropic.com'
            ? 'claude'
            : host === 'api.x.ai'
                ? 'grok'
                : host === 'api.openai.com'
                    ? 'openai'
                    : ['open.bigmodel.cn', 'api.z.ai'].includes(host)
                        ? 'glm'
                        : ['api.moonshot.cn', 'api.moonshot.ai'].includes(host)
                            ? 'kimi'
                            : host === 'api.kimi.com'
                                ? 'kimi-code'
                                : host === 'generativelanguage.googleapis.com'
                                    ? 'gemini'
                                    : /^(?:dashscope(?:-intl|-us)?\.aliyuncs\.com)$/.test(host) || host.endsWith('.maas.aliyuncs.com')
                                        ? 'qwen'
                                        : host.endsWith('.volces.com') ||
                                            host.endsWith('.bytepluses.com')
                                            ? 'doubao'
                                            : host === 'api.perplexity.ai'
                                                ? 'perplexity'
                                                : undefined;
    const model = req.model.toLowerCase().split('/').at(-1);
    let root = req.baseUrl.replace(/\/+$/, '');
    let provider = 'compatible';
    let format = req.protocol === 'anthropic-messages'
        ? 'anthropic'
        : req.protocol === 'openai-responses'
            ? 'responses'
            : 'chat';
    const headers = {
        'content-type': 'application/json',
    };
    if (req.apiKey)
        headers.authorization = `Bearer ${req.apiKey}`;
    const prompt = `Perform a web search for the query: ${query}`;
    const messages = [{ role: 'user', content: prompt }];
    const chat = { model: req.model, max_tokens: 4096, messages };
    if (official === 'deepseek') {
        provider = 'deepseek';
        format = 'anthropic';
        root = `${base.origin}/anthropic/v1`;
    }
    else if (official === 'claude' ||
        (!official && /^claude(?:-|$)/.test(model))) {
        provider = 'claude';
        format = 'anthropic';
        if (host === 'api.anthropic.com')
            root = `${base.origin}/v1`;
    }
    else if (official === 'grok' || (!official && /^grok(?:-|$)/.test(model))) {
        provider = 'grok';
        format = 'responses';
    }
    else if (official === 'openai' ||
        (!official && /^(?:gpt-|chatgpt-|o[1-9](?:-|$))/.test(model))) {
        provider = 'openai';
        format = /(?:search-api|search-preview)/.test(model) ? 'chat' : 'responses';
    }
    else if (official === 'glm' ||
        (!official && /^(?:glm|chatglm)(?:-|\d|$)/.test(model))) {
        provider = 'glm';
        format = 'glm';
        // Coding/Anthropic 入口使用厂商的 Coding Plan MCP，不以普通按量 API 冒充订阅能力。
        if ((host === 'api.z.ai' || host === 'open.bigmodel.cn') &&
            /\/(?:coding|anthropic)(?:\/|$)/.test(base.pathname)) {
            root = `${base.origin}/api/mcp/web_search_prime`;
            return {
                provider,
                root,
                endpoint: 'mcp',
                format: 'glm-mcp',
                headers,
                body: {
                    search_query: query,
                    content_size: 'medium',
                    count: 8,
                    search_engine: 'search-prime',
                },
            };
        }
    }
    else if (official === 'kimi') {
        provider = 'kimi';
        format = 'kimi';
        root = `${base.origin}/v1`;
        return {
            provider,
            root,
            endpoint: 'tools/search',
            format,
            headers,
            body: {
                text_query: query,
                limit: 8,
                include_content: false,
                timeout_seconds: 8,
            },
        };
    }
    else if (official === 'kimi-code' &&
        /^\/coding\/v1(?:\/|$)/.test(base.pathname)) {
        provider = 'kimi-code';
        format = 'kimi';
        root = `${base.origin}/coding/v1`;
        return {
            provider,
            root,
            endpoint: 'search',
            format,
            headers,
            body: {
                text_query: query,
                limit: 8,
                enable_page_crawling: false,
                timeout_seconds: 8,
            },
        };
    }
    else if (official === 'gemini' && /^gemini-/.test(model)) {
        provider = 'gemini';
        format = 'gemini';
        root = `${base.origin}/v1beta`;
        delete headers.authorization;
        if (req.apiKey)
            headers['x-goog-api-key'] = req.apiKey;
        return {
            provider,
            root,
            endpoint: `models/${encodeURIComponent(req.model.replace(/^models\//, ''))}:generateContent`,
            format,
            headers,
            body: {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                tools: [{ google_search: {} }],
                generationConfig: { maxOutputTokens: 4096 },
            },
        };
    }
    else if (official === 'qwen') {
        provider = 'qwen';
        format = 'qwen';
        root = `${base.origin}/api/v1`;
        return {
            provider,
            root,
            endpoint: 'services/aigc/text-generation/generation',
            format,
            headers,
            body: {
                model: req.model,
                input: { messages },
                parameters: {
                    max_tokens: 4096,
                    result_format: 'message',
                    enable_search: true,
                    search_options: {
                        enable_source: true,
                        forced_search: true,
                        search_strategy: 'agent',
                    },
                },
            },
        };
    }
    else if (!official && /^qwen(?:-|\d|$)/.test(model)) {
        provider = 'qwen-compatible';
        format = 'chat';
        return {
            provider,
            root,
            endpoint: 'chat/completions',
            format,
            headers,
            body: {
                ...chat,
                enable_search: true,
                search_options: { enable_source: true, forced_search: true },
            },
        };
    }
    else if (official === 'doubao' ||
        (!official && /^doubao(?:-|$)/.test(model))) {
        provider = 'doubao';
        format = 'responses';
    }
    else if (official === 'perplexity' ||
        (!official && /^(?:sonar)(?:-|$)/.test(model))) {
        provider = 'perplexity';
        format = 'chat';
        return {
            provider,
            root,
            endpoint: 'chat/completions',
            format,
            headers,
            body: chat,
        };
    }
    if (format === 'anthropic') {
        headers['anthropic-version'] = '2023-06-01';
        if (req.apiKey)
            headers['x-api-key'] = req.apiKey;
        return {
            provider,
            root,
            endpoint: 'messages',
            format,
            headers,
            body: {
                model: req.model,
                max_tokens: 4096,
                messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
                tools: [
                    { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
                ],
            },
        };
    }
    if (format === 'responses')
        return {
            provider,
            root,
            endpoint: 'responses',
            format,
            headers,
            body: {
                model: req.model,
                store: false,
                max_output_tokens: 4096,
                input: messages,
                tools: [{ type: 'web_search' }],
                tool_choice: 'required',
                ...(provider === 'grok' || provider === 'doubao'
                    ? {}
                    : { include: ['web_search_call.action.sources'] }),
            },
        };
    if (format === 'glm')
        return {
            provider,
            root,
            endpoint: 'chat/completions',
            format,
            headers,
            body: {
                ...chat,
                tools: [
                    {
                        type: 'web_search',
                        web_search: {
                            enable: true,
                            search_result: true,
                            search_query: query,
                            count: 8,
                        },
                    },
                ],
            },
        };
    return {
        provider,
        root,
        endpoint: 'chat/completions',
        format,
        headers,
        body: { ...chat, store: false, web_search_options: {} },
    };
}
//# sourceMappingURL=model-search-routing.js.map