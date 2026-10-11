import { createHash } from 'node:crypto';
import type {
  ConfigRepository,
  ContextRepository,
  SecretRepository,
  LlmPort,
  ChatContent,
} from '../ports/index.js';
import type { IncomingMessage } from '../../contracts/types.js';
import { canChat } from '../../domain/permission/access.js';
import { resolveEffective } from '../../domain/policy/merge.js';
import { evaluateTrigger } from '../../domain/policy/trigger.js';

export type ChatHandleResult =
  | { action: 'ignore'; reason: string }
  | { action: 'reply'; text: string; reason: string; commit?: () => void }
  | { action: 'error'; text: string; reason: string };

function conversationKey(msg: IncomingMessage): string {
  const c = msg.conversation;
  return JSON.stringify([
    c.adapterId,
    c.platform,
    c.botAccountId,
    c.kind,
    c.conversationId,
    msg.sender.userId,
  ]);
}

function extractUserText(msg: IncomingMessage): string {
  if (msg.rawText.startsWith('#chat对话')) {
    return msg.rawText.replace(/^#chat对话\s*/, '').trim();
  }
  if (msg.rawText.startsWith('#chat')) {
    return msg.rawText.replace(/^#chat\s*/, '').trim();
  }
  return msg.rawText.trim();
}

export async function handleChatMessage(options: {
  configStore: ConfigRepository;
  contextStore: ContextRepository;
  secrets: SecretRepository;
  llm: LlmPort;
  msg: IncomingMessage;
  force?: boolean;
  signal?: AbortSignal;
  deferHistory?: boolean;
  randomValue?: number;
  onModelFallback?(from: string, to: string): void;
  imageResolver?: {
    resolve(url: string, signal?: AbortSignal): Promise<string>;
  };
}): Promise<ChatHandleResult> {
  const { configStore, contextStore, msg } = options;
  const config = configStore.get();
  if (msg.isFromSelf) return { action: 'ignore', reason: '自身消息' };

  const access = canChat(config, msg.sender.userId);
  if (!access.allowed) return { action: 'ignore', reason: access.reason };

  const settings = resolveEffective(config, msg);
  const trigger = options.force
    ? { hit: true as const, reason: '显式命令' }
    : evaluateTrigger(msg, settings, options.randomValue ?? Math.random());
  const userText = extractUserText(msg);
  const images = msg.parts.filter((part) => part.type === 'image');
  if (!userText) return { action: 'ignore', reason: '空内容' };
  if (!trigger.hit) return { action: 'ignore', reason: trigger.reason };

  const provider = config.providers.find(
    (item) => item.id === settings.providerId && item.enabled,
  );
  const model = provider?.models.find((item) => item.id === settings.modelId);
  if (!provider || !model) {
    return {
      action: 'error',
      text: '未配置可用模型，请先在配置中设置供应商与默认路由。',
      reason: '无模型',
    };
  }
  if (
    images.length &&
    (!settings.replyImages || !model.inputTypes.includes('image'))
  ) {
    return {
      action: 'error',
      reason: 'IMAGE_DISABLED',
      text: '图片未发送：请开启基本配置中的“回复图片”，并为当前模型勾选图片输入。',
    };
  }
  let userContent: ChatContent = userText;
  let contextText = userText;
  if (images.length) {
    if (images.length > 8)
      return {
        action: 'error',
        reason: 'IMAGE_LIMIT',
        text: '单条消息最多携带 8 张图片。',
      };
    try {
      const urls = await Promise.all(
        images.map(async (part) => {
          if (part.type !== 'image' || !part.url)
            throw new Error('missing image');
          return options.imageResolver
            ? options.imageResolver.resolve(part.url, options.signal)
            : part.url;
        }),
      );
      if (urls.reduce((size, url) => size + url.length, 0) > 20 * 1024 * 1024) {
        return {
          action: 'error',
          reason: 'IMAGE_LIMIT',
          text: '图片总量过大，请压缩图片或分开发送。',
        };
      }
      const quote = msg.parts
        .filter(
          (part) => part.type === 'text' && part.text.startsWith('引用消息：'),
        )
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('\n');
      contextText = [userText, quote].filter(Boolean).join('\n');
      userContent = [
        ...urls.map((url) => ({ type: 'image' as const, url })),
        { type: 'text', text: contextText },
      ];
    } catch {
      return {
        action: 'error',
        reason: 'IMAGE_UNAVAILABLE',
        text: '图片读取失败或格式不支持，请重新发送图片。',
      };
    }
  }
  const namespace = createHash('sha256')
    .update(
      JSON.stringify([
        settings,
        provider.id,
        provider.baseUrl,
        provider.protocol,
        model,
      ]),
    )
    .digest('hex');
  const key = conversationKey(msg) + namespace;
  options.signal?.throwIfAborted();

  const apiKey =
    provider.auth.mode === 'none'
      ? ''
      : ((await options.secrets.get(provider.auth.secretRef)) ?? '');
  if (provider.auth.mode === 'api-key' && !apiKey) {
    return {
      action: 'error',
      text: '供应商密钥未配置。请用 #chat设置密钥 或编辑 data/config/plugin.yml / data/secrets。',
      reason: '无密钥',
    };
  }

  // 只发送当前消息直接携带或明确引用的图片，兼容清理旧缓存中的图片。
  const history = contextStore
    .get(key, settings.contextCount, settings.contextAgeMinutes)
    .map((turn) => ({
      ...turn,
      content:
        typeof turn.content === 'string'
          ? turn.content
          : turn.content.filter((part) => part.type === 'text'),
    }))
    .filter((turn) =>
      typeof turn.content === 'string'
        ? Boolean(turn.content.trim())
        : turn.content.length > 0,
    );
  const messages = [
    { role: 'system' as const, content: settings.systemPrompt },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user' as const, content: userContent },
  ];

  const generate = (
    selectedProvider: typeof provider,
    selectedModel: typeof model,
    selectedKey: string,
  ) => {
    return options.llm.generate({
      providerId: selectedProvider.id,
      web: selectedModel.toolCalling
        ? {
            config: config.web,
            contextWindowTokens: selectedModel.contextWindowTokens ?? 32768,
            revision: config.revision,
          }
        : undefined,
      signal: options.signal,
      protocol: selectedProvider.protocol,
      baseUrl: selectedProvider.baseUrl,
      apiKey: selectedKey,
      model: selectedModel.id,
      messages,
      maxTokens: selectedModel.maxOutputTokens,
      reasoningEnabled: selectedModel.reasoningEnabled,
      reasoningEffort: settings.reasoning,
      reasoningMode: selectedModel.reasoningMode,
      timeoutMs: config.runtime.llm.requestTimeoutSeconds * 1000,
    });
  };
  let result = await generate(provider, model, apiKey);
  const account = (p: typeof provider) =>
    JSON.stringify([p.baseUrl, p.auth.mode, p.auth.secretRef]);
  const exhausted = new Set<string>();
  let previousRoute = settings.route;
  // 只在明确的计费错误后切换；共享同一 API 账户的其他模型不会重复消耗请求。
  for (const route of settings.fallbackRoutes ?? []) {
    options.signal?.throwIfAborted();
    if (result.ok || result.code !== 'INSUFFICIENT_BALANCE') break;
    exhausted.add(account(provider));
    const separator = route.indexOf('|');
    const backupProvider = config.providers.find(
      (p) => p.id === route.slice(0, separator) && p.enabled,
    );
    const backupModel = backupProvider?.models.find(
      (m) => m.id === route.slice(separator + 1),
    );
    if (
      !backupProvider ||
      !backupModel ||
      exhausted.has(account(backupProvider))
    )
      continue;
    if (images.length && !backupModel.inputTypes.includes('image')) continue;
    if (model.toolCalling && !backupModel.toolCalling) continue;
    const backupKey =
      backupProvider.auth.mode === 'none'
        ? ''
        : await options.secrets.get(backupProvider.auth.secretRef);
    if (backupProvider.auth.mode === 'api-key' && !backupKey) continue;
    options.onModelFallback?.(previousRoute, route);
    result = await generate(backupProvider, backupModel, backupKey ?? '');
    if (!result.ok && result.code === 'INSUFFICIENT_BALANCE')
      exhausted.add(account(backupProvider));
    previousRoute = route;
  }

  if (!result.ok) {
    return {
      action: 'error',
      text: `模型调用失败：${result.message}`,
      reason: result.code,
    };
  }

  options.signal?.throwIfAborted();
  const commit = () =>
    contextStore.append(
      key,
      contextText,
      result.text,
      config.runtime.context.cacheTtlSeconds,
    );
  if (!options.deferHistory) commit();
  return {
    commit: options.deferHistory ? commit : undefined,
    action: 'reply',
    text: result.text,
    reason: trigger.reason,
  };
}
