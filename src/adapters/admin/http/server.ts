import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { ChatRuntime } from '../../../bootstrap/runtime.js';
import { paths } from '../../storage/paths.js';
import { getSecret, replaceSecret } from '../../storage/secrets-store.js';
import type { PluginConfig, ProtocolId } from '../../../contracts/types.js';
import { discoverUpstreamModels } from './discover-models.js';
import { validateConfig, ConfigValidationError } from '../../../contracts/config-schema.js';
import { publicWebConfig, prepareWebPatch } from '../../../application/admin/web-config.js';
import { RevisionConflictError } from '../../storage/yaml-config.js';
import type { SecretRepository } from '../../../application/ports/index.js';

type Session = { id: string; createdAt: number; lastSeen: number };

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('=') || '');
  }
  return out;
}

function toPublicConfig(config: PluginConfig) {
  return {
    schemaVersion: config.schemaVersion,
    revision: config.revision,
    plugin: config.plugin,
    admin: {
      mode: config.admin.mode,
      guoba: { ...config.admin.guoba },
      standalone: {
        enabled: config.admin.standalone.enabled,
        host: config.admin.standalone.host,
        port: config.admin.standalone.port,
        auth: { mode: 'dynamic-code', configured: true },
      },
    },
    providers: config.providers.map((provider) => ({
      id: provider.id,
      displayName: provider.displayName,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      protocol: provider.protocol,
      auth: {
        mode: provider.auth.mode,
        configured: Boolean(provider.auth.secretRef),
        maskedHint: provider.auth.maskedHint || '',
      },
      models: provider.models,
    })),
    web: publicWebConfig(config.web),
    prompts: config.prompts,
    defaults: config.defaults,
    policies: config.policies,
    access: {
      owner: config.access.owner,
      admins: config.access.admins,
      chatWhitelist: config.access.chatWhitelist,
      chatBlacklist: config.access.chatBlacklist,
    },
  };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new BodyLimitError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

class BodyLimitError extends Error {}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function getSession(req: http.IncomingMessage, sessions: Map<string, Session>): Session | null {
  const cookies = parseCookies(req.headers.cookie);
  const id = cookies.chat_plugin_session;
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.lastSeen > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  session.lastSeen = Date.now();
  return session;
}

export class AdminHttpServer {
  private server: http.Server | null = null;
  private readonly sessions = new Map<string, Session>();
  private readonly credentials = new Map<string, { digest: string; expiresAt: number; attempts: number }>();
  private readonly issuedAt = new Map<string, number>();

  issueLoginCode(channel: 'qq' | 'console'): string {
    const now = Date.now();
    if (now - (this.issuedAt.get(channel) ?? 0) < 30_000) throw new Error('请等待 30 秒后再获取验证码');
    this.issuedAt.set(channel, now);
    const code = channel === 'qq' ? randomInt(0, 1_000_000).toString().padStart(6, '0') : randomBytes(32).toString('hex');
    this.credentials.set(channel, { digest: hashPassword(code, channel), expiresAt: now + 5 * 60_000, attempts: 0 });
    return code;
  }

  private consumeLoginCode(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const channel = /^\d{6}$/.test(value) ? 'qq' : /^[a-f0-9]{64}$/.test(value) ? 'console' : null;
    if (!channel) return false;
    const credential = this.credentials.get(channel);
    if (!credential) return false;
    if (credential.expiresAt <= Date.now() || ++credential.attempts > 5) {
      this.credentials.delete(channel);
      return false;
    }
    if (!safeEqual(credential.digest, hashPassword(value, channel))) return false;
    this.credentials.delete(channel);
    return true;
  }

  constructor(private readonly runtime: ChatRuntime, private readonly secrets: SecretRepository = { get: getSecret, replace: replaceSecret }, private readonly discoverModels: typeof discoverUpstreamModels = discoverUpstreamModels) {}

  async start(): Promise<{ url: string } | null> {
    await this.runtime.ensureLoaded();
    const config = this.runtime.configStore.get();
    if (!config.admin.standalone.enabled) return null;

    const host = config.admin.standalone.host || '127.0.0.1';
    const port = config.admin.standalone.port || 50931;
    const publicDir = path.join(paths.root, 'admin-ui/dist');

    this.server = http.createServer(async (req, res) => {
      try {
        await this.handle(req, res, publicDir);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof BodyLimitError) {
          json(res, 413, { error: { code: 'PAYLOAD_TOO_LARGE', message: '请求超过 1 MiB' } });
          return;
        }
        if (error instanceof SyntaxError || error instanceof URIError) {
          json(res, 400, { error: { code: 'INVALID_REQUEST', message: '请求格式无效' } });
          return;
        }
        if (error instanceof ConfigValidationError || error instanceof RevisionConflictError) {
          json(res, error instanceof RevisionConflictError ? 409 : 422, { error: { code: error.code, message } });
          return;
        }
        json(res, 500, { error: { code: 'INTERNAL', message } });
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, host, () => resolve());
    });

    const url = `http://${host.includes(':') ? `[${host}]` : host}:${port}/`;
    console.log(`[chat-plugin] 自带管理面板监听：${url}`);
    if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
      console.log('[chat-plugin] 此地址仅运行环境内部可访问；Docker 外部访问请配置 admin.standalone.host=0.0.0.0 和端口映射。');
    } else if (host === '0.0.0.0' || host === '::') {
      console.log('[chat-plugin] 浏览器使用宿主机实际地址访问；Docker 还需映射面板端口。');
    }
    return { url };
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.sessions.clear();
    this.credentials.clear();
    this.issuedAt.clear();
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    publicDir: string,
  ): Promise<void> {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const method = req.method || 'GET';

    if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const file = path.join(publicDir, 'index.html');
      const html = await fs.readFile(file);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (url.pathname.startsWith('/admin/api/v1/')) {
      await this.handleApi(req, res, url, method);
      return;
    }

    // Vue 构建产物静态资源
    if (method === 'GET') {
      const rel = url.pathname.replace(/^\/+/, '') || 'index.html';
      const file = path.normalize(path.join(publicDir, rel));
      if (!file.startsWith(publicDir)) {
        json(res, 403, { error: { code: 'FORBIDDEN', message: '路径非法' } });
        return;
      }
      try {
        const data = await fs.readFile(file);
        const ext = path.extname(file);
        const type =
          ext === '.js'
            ? 'text/javascript; charset=utf-8'
            : ext === '.css'
              ? 'text/css; charset=utf-8'
              : ext === '.html'
                ? 'text/html; charset=utf-8'
                : ext === '.svg'
                  ? 'image/svg+xml'
                  : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        res.end(data);
        return;
      } catch {
        // SPA 回退
        try {
          const html = await fs.readFile(path.join(publicDir, 'index.html'));
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        } catch {
          json(res, 404, {
            error: { code: 'NOT_FOUND', message: '管理面板未构建，请执行 admin-ui 的 npm run build' },
          });
          return;
        }
      }
    }

    json(res, 404, { error: { code: 'NOT_FOUND', message: '未找到' } });
  }

  private async handleApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    method: string,
  ): Promise<void> {
    await this.runtime.ensureLoaded();

    if (method === 'POST' && url.pathname === '/admin/api/v1/auth/code') {
      let code: string;
      try { code = this.issueLoginCode('console'); }
      catch { json(res, 429, { error: { code: 'RATE_LIMITED', message: '请等待 30 秒后再获取验证码' } }); return; }
      console.log(`[chat-plugin] 面板动态登录密码：${code}（5 分钟有效，仅可使用一次）`);
      json(res, 200, { data: { ok: true, expiresIn: 300 } });
      return;
    }

    if (method === 'POST' && url.pathname === '/admin/api/v1/auth/session') {
      const body = JSON.parse((await readBody(req)) || '{}') as { password?: unknown };
      if (!this.consumeLoginCode(body.password)) {
        json(res, 401, { error: { code: 'AUTH_FAILED', message: '验证码错误或已失效，请重新获取' } });
        return;
      }
      const id = randomBytes(24).toString('hex');
      this.sessions.set(id, { id, createdAt: Date.now(), lastSeen: Date.now() });
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': `chat_plugin_session=${id}; Path=/; HttpOnly; SameSite=Strict`,
      });
      res.end(JSON.stringify({ data: { ok: true } }));
      return;
    }

    if (method === 'POST' && url.pathname === '/admin/api/v1/auth/logout') {
      const session = getSession(req, this.sessions);
      if (session) this.sessions.delete(session.id);
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': 'chat_plugin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict',
      });
      res.end(JSON.stringify({ data: { ok: true } }));
      return;
    }

    const session = getSession(req, this.sessions);
    if (!session) {
      json(res, 401, { error: { code: 'UNAUTHORIZED', message: '请先登录' } });
      return;
    }

    if (method !== 'GET' && req.headers.origin) {
      let sameOrigin = false;
      try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch { /* 非法来源直接拒绝 */ }
      if (!sameOrigin) { json(res, 403, { error: { code: 'FORBIDDEN', message: '不允许跨站管理请求' } }); return; }
    }
    if (method === 'POST' && url.pathname === '/admin/api/v1/web/test') {
      const body = JSON.parse((await readBody(req)) || '{}') as { providerId?: unknown; query?: unknown };
      if (typeof body.providerId !== 'string' || typeof body.query !== 'string' || !body.query.trim() || body.query.length > 1000) {
        json(res, 422, { error: { code: 'VALIDATION_ERROR', message: '需要搜索后端 ID 和 1–1000 字符查询' } }); return;
      }
      try { json(res, 200, { data: await this.runtime.testWebSearch(body.providerId, body.query.trim()) }); }
      catch { json(res, 502, { error: { code: 'WEB_TEST_FAILED', message: '搜索测试失败，请检查后端、模型和密钥配置' } }); }
      return;
    }
    if (method === 'GET' && url.pathname === '/admin/api/v1/config') {
      const config = this.runtime.configStore.get();
      json(res, 200, { data: toPublicConfig(config), requestId: randomBytes(4).toString('hex') });
      return;
    }

    if (method === 'PUT' && url.pathname === '/admin/api/v1/config') {
      const body = JSON.parse((await readBody(req)) || '{}') as {
        expectedRevision?: string;
        config?: Partial<PluginConfig> & {
          providers?: Array<
            PluginConfig['providers'][number] & { auth?: { mode?: string; replaceSecret?: string } }
          >;
        };

      };
      if ('search' in body || 'searchApiKey' in body) {
        json(res, 422, { error: { code: 'VALIDATION_ERROR', message: '旧版联网配置已移除，请使用 web 配置' } }); return;
      }
      const current = this.runtime.configStore.get();
      if (!body.expectedRevision || body.expectedRevision !== current.revision) {
        json(res, 409, {
          error: { code: 'REVISION_CONFLICT', message: '配置已被更新，请刷新后重试' },
          data: { revision: current.revision },
        });
        return;
      }

      const next: PluginConfig = structuredClone(current);
      const secretUpdates: Array<{ id: string; value: string; provider: { auth: { secretRef: string; maskedHint: string } } }> = [];
      const incoming = body.config;
      if (incoming?.runtime && 'search' in incoming.runtime) {
        json(res, 422, { error: { code: 'VALIDATION_ERROR', message: '旧版联网配置已移除，请使用 web 配置' } }); return;
      }
      if (incoming?.admin?.guoba) next.admin.guoba = { ...next.admin.guoba, ...incoming.admin.guoba };
      if (incoming?.plugin) next.plugin = { ...next.plugin, ...incoming.plugin };
      if (incoming?.defaults) next.defaults = { ...next.defaults, ...incoming.defaults };
      if (incoming?.access) {
        next.access = {
          owner: incoming.access.owner ?? next.access.owner,
          admins: incoming.access.admins ?? next.access.admins,
          chatWhitelist: incoming.access.chatWhitelist ?? next.access.chatWhitelist,
          chatBlacklist: incoming.access.chatBlacklist ?? next.access.chatBlacklist,
        };
      }
      if (incoming?.prompts) next.prompts = incoming.prompts;
      if (incoming?.policies) next.policies = incoming.policies;
      if (incoming?.providers) {
        next.providers = [];
        for (const provider of incoming.providers) {
          const copy = structuredClone(provider) as PluginConfig['providers'][number] & {
            auth: { mode: 'api-key' | 'none'; secretRef: string; maskedHint: string; replaceSecret?: string };
          };
          const replaceSecretValue = (provider.auth as { replaceSecret?: string } | undefined)
            ?.replaceSecret;
          const old = current.providers.find((item) => item.id === copy.id);
          copy.auth = {
            mode: copy.auth.mode,
            secretRef: old?.auth.secretRef ?? '',
            maskedHint: old?.auth.maskedHint ?? '',
          };
          if (replaceSecretValue) secretUpdates.push({ id: `provider-${copy.id}-${randomBytes(8).toString('hex')}`, value: replaceSecretValue, provider: copy });
          next.providers.push(copy);
        }
      }
      if (incoming?.web) {
        const prepared = prepareWebPatch(current.web, incoming.web);
        next.web = prepared.web;
        secretUpdates.push(...prepared.updates);
      }
      if (!next.access.owner.userId) {
        json(res, 422, { error: { code: 'OWNER_REQUIRED', message: '必须设置主人 QQ' } });
        return;
      }

      validateConfig(next);
      for (const update of secretUpdates) {
        const saved = await this.secrets.replace(update.id, update.value);
        update.provider.auth.secretRef = saved.ref;
        update.provider.auth.maskedHint = saved.maskedHint;
      }
      const savedConfig = await this.runtime.configStore.save(next, body.expectedRevision);

      json(res, 200, { data: toPublicConfig(savedConfig) });
      return;
    }

    if (method === 'GET' && url.pathname === '/admin/api/v1/status') {
      const config = this.runtime.configStore.get();
      json(res, 200, {
        data: {
          revision: config.revision,
          pluginEnabled: config.plugin.enabled,
          owner: config.access.owner,
          panel: 'standalone',
        },
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/admin/api/v1/providers/discover') {
      const body = JSON.parse((await readBody(req)) || '{}') as {
        providerId?: string;
        baseUrl?: string;
        protocol?: ProtocolId;
        replaceSecret?: string;
      };
      const config = this.runtime.configStore.get();
      const existing = body.providerId
        ? config.providers.find((item) => item.id === body.providerId)
        : undefined;
      if (!existing) {
        json(res, 404, { error: { code: 'NOT_FOUND', message: '请先保存供应商。' } });
        return;
      }
      if (body.baseUrl !== undefined || body.protocol !== undefined || body.replaceSecret !== undefined) {
        json(res, 422, { error: { code: 'VALIDATION_ERROR', message: '已保存供应商仅接受 providerId；草稿请在浏览器获取模型。' } });
        return;
      }
      const apiKey = existing.auth.mode === 'api-key' && existing.auth.secretRef
        ? await this.secrets.get(existing.auth.secretRef) : undefined;
      if (existing.auth.mode === 'api-key' && !apiKey) {
        json(res, 422, { error: { code: 'VALIDATION_ERROR', message: '供应商密钥未配置，请先保存真实 API 密钥。' } });
        return;
      }
      try {
        const result = await this.discoverModels({ baseUrl: existing.baseUrl, protocol: existing.protocol, apiKey });
        json(res, 200, { data: result, requestId: randomBytes(4).toString('hex') });
      } catch (error) {
        const err = error as Error & { code?: string };
        const code = err.code || 'UPSTREAM_INVALID_RESPONSE';
        const status =
          code === 'VALIDATION_ERROR'
            ? 422
            : code === 'UPSTREAM_AUTH_FAILED'
              ? 502
              : code === 'UPSTREAM_RATE_LIMITED'
                ? 503
                : code === 'UPSTREAM_TIMEOUT'
                  ? 504
                  : 502;
        json(res, status, { error: { code, message: err.message } });
      }
      return;
    }

    json(res, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } });
  }
}
