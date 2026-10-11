import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ConfigValidationError, validateConfig } from '../../contracts/config-schema.js';
import type { PluginConfig } from '../../contracts/types.js';
import type { WebConfig, WebProviderConfig } from '../../contracts/web.js';
import type { ConfigRepository, SecretRepository } from '../ports/index.js';

export function publicWebConfig(web: WebConfig) {
  return { ...web, providers: web.providers.map(p => ({ ...p, auth: { configured: Boolean(p.auth.secretRef), maskedHint: p.auth.maskedHint } })) };
}
export type WebSecretUpdate = { id: string; value: string; provider: WebProviderConfig };

/** 三管理入口共用秘密保留/替换/清除规则，外部不能写入任意 secretRef。 */
export function prepareWebPatch(current: WebConfig, input: unknown): { web: WebConfig; updates: WebSecretUpdate[] } {
  const parsed = z.record(z.unknown()).safeParse(input);
  if (!parsed.success) throw new ConfigValidationError('联网配置结构无效');
  const patch = parsed.data;
  const web = { ...structuredClone(current), ...patch } as WebConfig;
  const updates: WebSecretUpdate[] = [];
  if (patch.providers !== undefined) {
    if (!Array.isArray(patch.providers)) throw new ConfigValidationError('搜索后端必须为数组');
    web.providers = patch.providers.map(item => {
      const result = z.record(z.unknown()).safeParse(item);
      if (!result.success) throw new ConfigValidationError('搜索后端结构无效');
      const entry = structuredClone(result.data);
      const auth = z.object({ configured: z.boolean().optional(), maskedHint: z.string().optional(), replaceSecret: z.string().max(4096).optional(), clearSecret: z.boolean().optional() }).strict().safeParse(entry.auth);
      if (!auth.success) throw new ConfigValidationError('搜索认证格式无效，不接受客户端秘密引用');
      const fields = auth.data;
      if (fields.clearSecret && fields.replaceSecret) throw new ConfigValidationError('不能同时替换和清除搜索密钥');
      const old = current.providers.find(p => p.id === entry.id);
      if (old?.auth.secretRef && (entry.type !== old.type || entry.baseUrl !== old.baseUrl) && !fields.clearSecret && !fields.replaceSecret) {
        throw new ConfigValidationError('更换搜索服务或地址时请替换或清除原密钥');
      }
      entry.auth = fields.clearSecret ? { secretRef: '', maskedHint: '' } : structuredClone(old?.auth ?? { secretRef: '', maskedHint: '' });
      const provider = entry as unknown as WebProviderConfig;
      if (fields.replaceSecret) updates.push({ id: `web-${String(entry.id)}-${randomUUID()}`, value: fields.replaceSecret, provider });
      return provider;
    });
  }
  return { web, updates };
}

export async function saveWebConfig(options: {
  repository: ConfigRepository; secrets: SecretRepository;
  expectedRevision: string; patch: unknown; webEnabled?: boolean;
}) {
  const next = options.repository.get();
  if (next.revision !== options.expectedRevision) throw new ConfigValidationError('配置已更新，请刷新后再保存');
  const prepared = prepareWebPatch(next.web, options.patch);
  next.web = prepared.web;
  if (options.webEnabled !== undefined) next.defaults.webEnabled = options.webEnabled;
  validateConfig(next);
  for (const update of prepared.updates) {
    const saved = await options.secrets.replace(update.id, update.value);
    update.provider.auth = { secretRef: saved.ref, maskedHint: saved.maskedHint };
  }
  return options.repository.save(next, options.expectedRevision);
}

/** 锅巴只在明确授权宿主管理者时提供联网配置，不从请求字段猜测主人身份。 */
export function assertGuobaWebAccess(config: PluginConfig): void {
  if (!config.admin.guoba.enabled || !config.admin.guoba.trustHostAdministrators) {
    throw new ConfigValidationError('锅巴入口或授权已关闭，请在自带面板“权限与启用”中开启');
  }
}
