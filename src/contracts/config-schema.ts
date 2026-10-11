import { z } from 'zod';
import { publicUrl } from '../domain/network/public-url.js';
import type { PluginConfig } from './types.js';

const text = z.string().min(1).max(256);
const ids = z.array(text).max(10000);
const entityId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const secretRef = z.string().regex(/^(?:|env:[A-Za-z_][A-Za-z0-9_]*|store:[a-zA-Z0-9_-]+)$/);
const positive = z.number().int().positive();
const kind = z.enum(['all', 'private', 'group']);
const defaults = z.object({
  route: text, fallbackRoutes: z.array(text).max(10).refine(routes => new Set(routes).size === routes.length, '后备模型不能重复').default([]), prompt: text, regex: z.string().max(512), alwaysPrivate: z.boolean(),
  reasoning: z.enum(['auto', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
  webEnabled: z.boolean().default(false),
  replyImages: z.boolean(), replyFiles: z.boolean(),
  contextCount: z.number().int().min(0).max(1000),
  contextAgeMinutes: z.number().min(0).max(525600),
  groupRandom: z.boolean(), replyProbability: z.number().min(0).max(100),
}).strict();
const model = z.object({
  reasoningEnabled: z.boolean().optional(),
  reasoningMode: z.enum(['auto', 'deepseek', 'anthropic-adaptive']).optional(),
  id: text, displayName: text, contextWindowTokens: positive.optional(),
  maxOutputTokens: positive.optional(), toolCalling: z.boolean().optional(), inputTypes: z.array(z.enum(['text', 'image', 'file'])).min(1),
}).strict();
const provider = z.object({
  id: entityId, displayName: text, enabled: z.boolean(),
  baseUrl: z.string().url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash && !url.search;
  }, 'API 地址必须为无凭据、查询和片段的 HTTP(S) 基础地址'),
  protocol: z.enum(['openai-responses', 'openai-chat-completions', 'anthropic-messages']),
  auth: z.object({ mode: z.enum(['api-key', 'none']), secretRef, maskedHint: z.string().max(65536).default('') }).strict(),
  models: z.array(model).max(2000),
}).strict();
const web = z.object({
  engineOrder: z.array(z.enum(['exa-mcp', 'duckduckgo', 'bing', 'searxng', 'exa'])).min(1).max(5)
    .refine(values => new Set(values).size === values.length, '搜索引擎不能重复')
    .default(['exa-mcp', 'duckduckgo', 'bing']),
  enabled: z.boolean().default(false),
  searchProviderId: z.string().max(64).default(''),
  providers: z.array(z.object({
    id: entityId, type: z.enum(['deepseek-native', 'exa', 'perplexity', 'searxng']),
    enabled: z.boolean(), baseUrl: provider.shape.baseUrl.refine(v => {
      try { return publicUrl(v).protocol === 'https:'; } catch { return false; }
    }, '搜索 API 必须使用标准端口的公网 HTTPS 地址'),
    model: text.optional(), maxUses: positive.max(5).default(5),
    auth: z.object({ secretRef, maskedHint: z.string().max(128).default('') }).strict(),
  }).strict()).max(20).default([]),
  searchTimeoutSeconds: positive.max(60).default(30),
  fetchTimeoutSeconds: positive.max(60).default(30),
  maxFetchChars: positive.max(200000).default(200000),
  maxToolCalls: positive.max(16).default(8), maxToolRounds: positive.max(8).default(4),
  agentTimeoutSeconds: positive.max(300).default(120),
}).strict().default({});
const schema = z.object({
  schemaVersion: z.literal(1), revision: text,
  plugin: z.object({ enabled: z.boolean() }).strict(),
  admin: z.object({
    mode: z.enum(['guoba', 'standalone']),
    guoba: z.object({ enabled: z.boolean().default(true), trustHostAdministrators: z.boolean().default(true) }).strict(),
    standalone: z.object({ enabled: z.boolean(), host: text, port: z.number().int().min(1).max(65535),
      auth: z.object({ mode: z.literal('owner-password'), passwordSecretRef: secretRef }).strict(),
    }).strict(),
  }).strict(),
  web,
  providers: z.array(provider).max(100),
  prompts: z.array(z.object({ id: entityId, name: text, enabled: z.boolean(), content: z.string().min(1).max(65536) }).strict()).max(1000),
  defaults,
  policies: z.array(z.object({
    id: entityId, name: text, enabled: z.boolean(), priority: z.number().int(),
    bindUsers: ids, whitelistUsers: ids, blacklistUsers: ids, kind, groupIds: ids,
    overrides: defaults.partial().extend({ webEnabled: z.boolean().optional() }),
  }).strict()).max(1000),
  access: z.object({
    owner: z.object({ platform: text, userId: z.string().max(256), name: z.string().max(256).optional(), botAccountId: text.optional() }).strict(),
    admins: z.array(z.object({ id: entityId, enabled: z.boolean(), userId: text, name: text, kind, groupIds: ids, blacklistUsers: ids }).strict()).max(1000),
    chatWhitelist: ids, chatBlacklist: ids,
  }).strict(),
  runtime: z.object({
    queue: z.object({ maxPendingPerSession: positive, maxConcurrentGlobal: positive }).strict(),
    limits: z.object({ perUserRequestsPerMinute: positive, globalRequestsPerMinute: positive }).strict(),
    llm: z.object({ requestTimeoutSeconds: positive.max(600), maxAttempts: positive.max(5) }).strict(),
    context: z.object({ storage: z.literal('memory'), cacheTtlSeconds: positive }).strict(),
  }).strict(),
}).strict();

export class ConfigValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
}

/** 当前 v0.1 平面配置契约；完整嵌套设计的迁移仍需单独完成。 */
export function validateConfig(input: unknown): PluginConfig {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ConfigValidationError(result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  const config = result.data;
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) throw new ConfigValidationError(`${label} ID 重复`);
  };
  unique(config.providers.map(p => p.id), '提供商');
  unique(config.web.providers.map(p => p.id), '搜索后端');
  if (config.web.searchProviderId && !config.web.providers.some(p => p.id === config.web.searchProviderId)) {
    throw new ConfigValidationError('搜索后端引用不存在');
  }
  if (config.web.enabled && !config.web.providers.some(p => p.id === config.web.searchProviderId && p.enabled)) {
    throw new ConfigValidationError('启用联网前需选择已启用的搜索后端');
  }
  for (const p of config.web.providers) {
    if (p.type === 'deepseek-native' && !p.model) throw new ConfigValidationError('DeepSeek 搜索需指定模型');
  }
  unique(config.prompts.map(p => p.id), '提示词');
  unique(config.policies.map(p => p.id), '策略');
  unique(config.access.admins.map(p => p.id), '管理员');
  for (const p of config.providers) {
    unique(p.models.map(m => m.id), `${p.id} 模型`);
    for (const m of p.models) {
      if (!m.inputTypes.includes('text')) throw new ConfigValidationError(`${p.id}/${m.id} 必须支持文本`);
      if (m.contextWindowTokens && m.maxOutputTokens && m.maxOutputTokens > m.contextWindowTokens) {
        throw new ConfigValidationError(`${p.id}/${m.id} 最大输出超过上下文窗口`);
      }
    }
  }
  const validateSettings = (settings: Partial<PluginConfig['defaults']>) => {
    for (const route of [settings.route, ...(settings.fallbackRoutes ?? [])].filter((value): value is string => Boolean(value))) {
      const separator = route.indexOf('|');
      const p = config.providers.find(p => p.id === route.slice(0, separator));
      if (!p?.models.some(m => m.id === route.slice(separator + 1))) {
        throw new ConfigValidationError('模型路由引用不存在');
      }
    }
    if (settings.prompt && !config.prompts.some(p => p.id === settings.prompt && p.enabled)) {
      throw new ConfigValidationError('提示词引用不存在或已停用');
    }
    if (settings.regex) {
      try { new RegExp(settings.regex, 'iu'); } catch { throw new ConfigValidationError('正则表达式无效'); }
    }
  };
  validateSettings(config.defaults);
  config.policies.forEach(p => validateSettings(p.overrides));
  for (const admin of config.access.admins) {
    if (admin.userId === config.access.owner.userId) throw new ConfigValidationError('主人不能同时是管理员');
    if (admin.kind === 'group' && !admin.groupIds.length) throw new ConfigValidationError('指定群聊管理员必须填写群 ID');
    if (admin.blacklistUsers.includes(admin.userId)) throw new ConfigValidationError('管理员被自身黑名单排除');
  }
  return config;
}
