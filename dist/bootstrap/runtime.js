import { searchWithFallback } from '../application/web/search-service.js';
import { searchCurrentModel } from '../adapters/web/model-search.js';
import { evaluateTrigger } from '../domain/policy/trigger.js';
import { LangGraphAgent } from '../adapters/agent/langgraph.js';
import { ChatScheduler } from '../application/chat/scheduler.js';
import { AdminHttpServer } from '../adapters/admin/http/server.js';
import { MemoryContextStore } from '../adapters/storage/memory-context.js';
import { paths } from '../adapters/storage/paths.js';
import { YamlConfigStore } from '../adapters/storage/yaml-config.js';
import { getSecret, replaceSecret } from '../adapters/storage/secrets-store.js';
import { runWebAgent } from '../application/chat/agent-loop.js';
import { nextToolGeneration } from '../adapters/llm/tool-generation.js';
import { BuiltinSearch } from '../adapters/web/builtin-search.js';
import { searchProvider } from '../adapters/web/search-providers.js';
import { fetchWeb } from '../adapters/web/http-fetch.js';
import { WebQueue } from '../application/web/web-service.js';
import { canChat } from '../domain/permission/access.js';
import { resolveEffective } from '../domain/policy/merge.js';
import { WebError } from '../contracts/web.js';
import { generateText } from '../adapters/llm/generate.js';
import { resolveYunzaiImage } from '../adapters/bots/yunzai/images.js';
import { tryHandleCommand } from '../application/admin/commands.js';
import { handleChatMessage } from '../application/chat/handle-message.js';
export class ChatRuntime {
    builtinSearch;
    diagnosticLogger = message => console.warn(message);
    constructor(options = {}) {
        this.builtinSearch = new BuiltinSearch(options.searchHttp, (engine, code, reason) => this.logWeb(`search backend=${engine} error=${code}${reason ? ` reason=${reason}` : ''}`));
    }
    /** 宿主桥接注入自己的日志入口，核心不依赖 Yunzai 全局 logger。 */
    setDiagnosticLogger(logger) {
        this.diagnosticLogger = logger;
    }
    logWeb(message) {
        try {
            this.diagnosticLogger(`[chat-plugin][web] ${message}`);
        }
        catch { /* 日志后端失败不影响聊天和取消。 */ }
    }
    configStore = new YamlConfigStore();
    contextStore = new MemoryContextStore();
    adminServer = new AdminHttpServer(this);
    webQueue = new WebQueue();
    agent = new LangGraphAgent();
    scheduler = new ChatScheduler();
    requests = new Set();
    ready = null;
    panelUrl = null;
    ensureLoaded() {
        this.ready ??= this.configStore.load().then(() => undefined);
        return this.ready;
    }
    get pluginRoot() {
        return paths.root;
    }
    getPanelUrl() {
        return this.panelUrl;
    }
    issuePanelLoginCode() {
        if (!this.panelUrl)
            throw new Error('自带面板未启动');
        return this.adminServer.issueLoginCode('qq');
    }
    async startPanel() {
        await this.ensureLoaded();
        const started = await this.adminServer.start();
        this.panelUrl = started?.url ?? null;
        return this.panelUrl;
    }
    async stop() {
        for (const controller of this.requests)
            controller.abort();
        await this.stopPanel();
    }
    async stopPanel() {
        await this.adminServer.stop();
        this.panelUrl = null;
    }
    async testWebSearch(providerId, query) {
        await this.ensureLoaded();
        const config = this.configStore.get();
        const provider = config.web.providers.find((p) => p.id === providerId && p.enabled);
        if (!provider)
            throw new WebError('WEB_NOT_CONFIGURED', '搜索后端未启用');
        const key = await getSecret(provider.auth.secretRef);
        if (!key && provider.type !== 'searxng')
            throw new WebError('WEB_NO_KEY', '搜索密钥未配置');
        const controller = new AbortController();
        this.requests.add(controller);
        const signal = AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(config.web.searchTimeoutSeconds * 1000),
        ]);
        const unsubscribe = this.configStore.subscribe((next) => {
            if (JSON.stringify(next.web) !== JSON.stringify(config.web) ||
                !next.plugin.enabled)
                controller.abort();
        });
        if (this.configStore.get().revision !== config.revision)
            controller.abort();
        try {
            return await this.webQueue.run(provider.id, signal, () => searchProvider(provider, key ?? '', query, signal));
        }
        finally {
            unsubscribe();
            this.requests.delete(controller);
        }
    }
    async handleMessage(msg, deliver) {
        await this.ensureLoaded();
        const secrets = { get: getSecret, replace: replaceSecret };
        const command = await tryHandleCommand({
            configStore: this.configStore,
            secrets,
            msg,
        });
        if (command.handled) {
            const reply = { reply: command.reply };
            if (deliver)
                await deliver(reply);
            return reply;
        }
        const snapshotAtAdmission = this.configStore.get();
        const force = msg.rawText.startsWith('#chat对话') || /^#chat(\s|$)/.test(msg.rawText);
        const randomValue = Math.random();
        const admissionAccess = canChat(snapshotAtAdmission, msg.sender.userId);
        if (msg.isFromSelf || !admissionAccess.allowed)
            return { ignoreReason: '无聊天权限' };
        if (!force &&
            !evaluateTrigger(msg, resolveEffective(snapshotAtAdmission, msg), randomValue).hit)
            return { ignoreReason: '未触发' };
        const key = JSON.stringify([msg.conversation, msg.sender.userId]);
        const controller = new AbortController();
        this.requests.add(controller);
        const signal = AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(Math.max(snapshotAtAdmission.runtime.llm.requestTimeoutSeconds, snapshotAtAdmission.web.agentTimeoutSeconds) * 1000),
        ]);
        const unsubscribeAll = this.configStore.subscribe((next) => {
            if (!canChat(next, msg.sender.userId).allowed ||
                JSON.stringify(resolveEffective(next, msg)) !==
                    JSON.stringify(resolveEffective(snapshotAtAdmission, msg)) ||
                JSON.stringify(next.providers) !==
                    JSON.stringify(snapshotAtAdmission.providers) ||
                JSON.stringify(next.web) !== JSON.stringify(snapshotAtAdmission.web))
                controller.abort();
        });
        try {
            const queued = await this.scheduler.run({
                key,
                identity: msg.messageId || msg.eventId
                    ? key + (msg.messageId || msg.eventId)
                    : undefined,
                user: JSON.stringify([msg.sender.platform, msg.sender.userId]),
                signal,
                globalLimit: snapshotAtAdmission.runtime.limits.globalRequestsPerMinute,
                userLimit: snapshotAtAdmission.runtime.limits.perUserRequestsPerMinute,
                concurrency: snapshotAtAdmission.runtime.queue.maxConcurrentGlobal,
                pendingLimit: snapshotAtAdmission.runtime.queue.maxPendingPerSession,
            }, async () => {
                const result = await handleChatMessage({
                    configStore: this.configStore,
                    contextStore: this.contextStore,
                    secrets,
                    onModelFallback: (from, to) => {
                        try {
                            this.diagnosticLogger(`[chat-plugin][model] insufficient_balance; switching=${from} -> ${to}`);
                        }
                        catch { }
                    },
                    llm: {
                        generate: async (req) => {
                            if (!req.web)
                                return this.agent.run(() => this.webQueue.run(req.baseUrl, req.signal, () => generateText(req)), req.signal, 4);
                            const snapshot = this.configStore.get();
                            if (snapshot.revision !== req.web.revision)
                                return {
                                    ok: false,
                                    code: 'CANCELLED',
                                    message: '配置已变更，请重新提问',
                                };
                            // UTF-8 字节数作为保守 token 上界，保留输出和协议开销，工具只占剩余预算。
                            const inputBytes = Buffer.byteLength(JSON.stringify(req.messages));
                            const remaining = req.web.contextWindowTokens -
                                (req.maxTokens ?? 1024) -
                                inputBytes -
                                4096;
                            if (remaining < 2048)
                                return {
                                    ok: false,
                                    code: 'WEB_CONTEXT_BUDGET',
                                    message: '上下文不足，请减少历史条数或输出上限',
                                };
                            const controller = new AbortController();
                            this.requests.add(controller);
                            const signal = AbortSignal.any([
                                req.signal,
                                controller.signal,
                                AbortSignal.timeout(req.web.config.agentTimeoutSeconds * 1000),
                            ]);
                            const unsubscribe = this.configStore.subscribe((next) => {
                                const active = next.providers.find((p) => p.id === (req.providerId ?? resolveEffective(snapshot, msg).providerId));
                                const original = snapshot.providers.find((p) => p.id === active?.id);
                                if (!canChat(next, msg.sender.userId).allowed ||
                                    JSON.stringify(next.web) !== JSON.stringify(snapshot.web) ||
                                    !active?.enabled ||
                                    JSON.stringify(active) !== JSON.stringify(original) ||
                                    !active.models.some((m) => m.id === req.model && m.toolCalling) ||
                                    JSON.stringify(next.access.owner) !==
                                        JSON.stringify(snapshot.access.owner))
                                    controller.abort();
                            });
                            if (this.configStore.get().revision !== snapshot.revision)
                                controller.abort();
                            try {
                                return await runWebAgent({
                                    agent: this.agent,
                                    model: {
                                        next: (turns, enabled, abort) => this.webQueue.run(req.baseUrl, abort, () => nextToolGeneration(req, turns, enabled, abort)),
                                    },
                                    config: req.web.config,
                                    signal,
                                    toolBytes: Math.min(remaining / 2, 200000),
                                    web: {
                                        search: async (query, abort) => {
                                            this.logWeb('search start backend=model-native');
                                            try {
                                                const result = await searchWithFallback({
                                                    signal: abort, timeoutSeconds: req.web.config.searchTimeoutSeconds,
                                                    onFallback: code => this.logWeb(`search backend=model-native error=${code}; fallback=builtin`),
                                                    native: nativeSignal => this.webQueue.run(req.baseUrl, nativeSignal, () => searchCurrentModel(req, query, nativeSignal)),
                                                    builtin: (fallbackSignal, remainingSeconds) => this.webQueue.run('builtin-search', fallbackSignal, () => this.builtinSearch.search({ ...req.web.config, searchTimeoutSeconds: remainingSeconds }, query, fallbackSignal, getSecret)),
                                                });
                                                this.logWeb(`search complete backend=${result.engine ?? 'unknown'} sources=${result.sources.length}`);
                                                return result;
                                            }
                                            catch (cause) {
                                                this.logWeb(`search failed error=${cause instanceof WebError ? cause.code : abort.aborted ? 'CANCELLED' : 'WEB_SEARCH_FAILED'}`);
                                                throw cause;
                                            }
                                        },
                                        fetch: (url, maxChars, abort) => this.webQueue.run('http-fetch', abort, () => fetchWeb(url, { maxChars, signal: abort }).catch(cause => {
                                            this.logWeb(`fetch failed error=${cause instanceof WebError ? cause.code : 'WEB_NETWORK_ERROR'}${cause instanceof WebError && cause.diagnostic ? ` reason=${cause.diagnostic}` : ''}`);
                                            throw cause;
                                        })),
                                    },
                                });
                            }
                            finally {
                                unsubscribe();
                                this.requests.delete(controller);
                            }
                        },
                    },
                    imageResolver: {
                        resolve: (url, abort) => resolveYunzaiImage(url, fetch, abort),
                    },
                    msg,
                    signal,
                    deferHistory: true,
                    randomValue,
                    force,
                });
                if (result.action === 'ignore')
                    return { ignoreReason: result.reason };
                const reply = {
                    reply: result.text,
                    renderMarkdown: result.action === 'reply',
                };
                if (deliver)
                    await deliver(reply);
                signal.throwIfAborted();
                if (result.action === 'reply')
                    result.commit?.();
                return reply;
            });
            return queued ?? { ignoreReason: '重复消息' };
        }
        catch (error) {
            if (signal.aborted)
                return { reply: '聊天请求已取消或超时', renderMarkdown: false };
            throw error;
        }
        finally {
            unsubscribeAll();
            this.requests.delete(controller);
        }
    }
}
let singleton = null;
export function getRuntime() {
    singleton ??= new ChatRuntime();
    return singleton;
}
//# sourceMappingURL=runtime.js.map