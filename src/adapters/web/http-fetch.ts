import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import ipaddr from 'ipaddr.js';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import { WebError, type FetchResult } from '../../contracts/web.js';

import { publicUrl, isPublicAddress } from '../../domain/network/public-url.js';
export { publicUrl, isPublicAddress } from '../../domain/network/public-url.js';

export type HttpDocument = { status: number; headers: http.IncomingHttpHeaders; text: string };
export type PublicHttpOptions = { signal: AbortSignal; method?: 'GET' | 'POST' | 'DELETE'; body?: string; headers?: Record<string, string> };
export type PublicHttp = (url: URL, options: PublicHttpOptions) => Promise<HttpDocument>;

/** 预先验证全部 DNS 结果，并把同一结果固定给连接；禁止自动跟随重定向。 */
export function createPublicHttp(
  resolve: (host: string) => Promise<Array<{ address: string; family: number }>> = host => dns.lookup(host, { all: true, verbatim: true }),
  dispatch?: typeof http.request,
  trustedFakeIpHosts: ReadonlySet<string> = new Set(),
): PublicHttp {
  return async (url, options) => {
    options.signal.throwIfAborted();
    publicUrl(url.href);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // 仅调用方写死的 HTTPS 搜索服务可经 TUN 的 Fake-IP 路由，不允许模型控制白名单。
    const allowFakeIp = url.protocol === 'https:' && !url.port && trustedFakeIpHosts.has(host);
    const permitted = (address: string) => isPublicAddress(address) || (allowFakeIp && isFakeIp(address));
    const dnsCleanup: Array<() => void> = [];
    const records = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
      resolve(host),
      new Promise<never>((_, reject) => {
        const abort = () => reject(new WebError('CANCELLED', '网络请求已取消'));
        options.signal.addEventListener('abort', abort, { once: true });
        // DNS promise 不支持取消；完成时移除监听器，连接仍绑定结果。
        dnsCleanup.push(() => options.signal.removeEventListener('abort', abort));
      }),
    ]).finally(() => { for (const cleanup of dnsCleanup.splice(0)) cleanup(); });
    if (!records.length || records.some(r => !permitted(r.address))) {
      const fakeIp = records.some(r => /^198\.(18|19)\./.test(r.address));
      throw new WebError('WEB_BLOCKED_URL', '目标包含非公网地址', fakeIp ? 'DNS_FAKE_IP' : 'DNS_NON_PUBLIC_OR_EMPTY');
    }
    options.signal.throwIfAborted();
    const target = records[0]!;
    return new Promise<HttpDocument>((resolve, reject) => {
      const request = (dispatch ?? (url.protocol === 'https:' ? https : http).request)(url, {
        method: options.method ?? 'GET', agent: false, signal: options.signal,
        headers: { 'user-agent': 'chat-plugin/0.1', 'accept-encoding': 'gzip, deflate, br', ...options.headers },
        lookup: (_hostname, lookupOptions, callback) => {
          if (lookupOptions.all) callback(null, [{ address: target.address, family: target.family }]);
          else callback(null, target.address, target.family);
        },
      }, response => {
        if (response.statusCode && response.statusCode >= 300) {
          response.destroy();
          resolve({ status: response.statusCode, headers: response.headers, text: '' });
          return;
        }
        const encoding = response.headers['content-encoding'];
        const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : undefined;
        if (encoding && encoding !== 'identity' && !decoder) {
          response.destroy(); reject(new WebError('WEB_CONTENT_TYPE', '不支持的内容编码')); return;
        }
        const stream = decoder ? response.pipe(decoder) : response;
        const chunks: Buffer[] = [];
        let bytes = 0, wireBytes = 0;
        const fail = (error: Error) => { stream.destroy(); response.destroy(); request.destroy(); reject(error); };
        response.on('data', chunk => {
          wireBytes += chunk.length;
          if (wireBytes > 4 * 1024 * 1024) fail(new WebError('WEB_RESPONSE_TOO_LARGE', '网络响应超过 4 MiB'));
        });
        response.on('error', fail);
        stream.on('error', fail);
        const abort = () => fail(new WebError('CANCELLED', '网络请求已取消'));
        options.signal.addEventListener('abort', abort, { once: true });
        stream.on('close', () => options.signal.removeEventListener('abort', abort));
        stream.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 4 * 1024 * 1024) { fail(new WebError('WEB_RESPONSE_TOO_LARGE', '网页响应超过 4 MiB')); return; }
          chunks.push(Buffer.from(chunk));
        });
        stream.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.on('socket', socket => {
        socket.once('connect', () => {
          if (!socket.remoteAddress || !permitted(socket.remoteAddress) ||
              ipaddr.process(socket.remoteAddress).toString() !== ipaddr.process(target.address).toString()) {
            request.destroy(new WebError('WEB_BLOCKED_URL', '实际连接目标不符合公网校验', 'CONNECTION_ADDRESS_MISMATCH_OR_NON_PUBLIC'));
          }
        });
      });
      request.on('error', reject);
      request.end(options.body);
    });
  };
}
export const requestPublic = createPublicHttp();

function isFakeIp(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.kind() === 'ipv4' && parsed.match(ipaddr.parse('198.18.0.0'), 15);
  } catch { return false; }
}

export function extractMarkdown(html: string, url: string): { title?: string; markdown: string } {
  const { document } = parseHTML(html);
  const title = document.querySelector('title')?.textContent?.trim() || undefined;
  for (const node of document.querySelectorAll('script,style,noscript,template,iframe,object,embed,form,input,button,svg,canvas,meta,link,[hidden],[aria-hidden="true"]')) node.remove();
  for (const node of document.querySelectorAll('[style]')) {
    if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(node.getAttribute('style') ?? '')) node.remove();
  }
  for (const node of document.querySelectorAll('a')) {
    try { const href = publicUrl(new URL(node.getAttribute('href') ?? '', url).href); node.setAttribute('href', href.href); }
    catch { node.removeAttribute('href'); }
  }
  // 图片、事件属性和原始 HTML 不进入工具结果。
  for (const node of document.querySelectorAll('img')) node.remove();
  const markdown = new TurndownService({ headingStyle: 'atx' }).turndown(document.body?.innerHTML || document.documentElement?.innerHTML || '');
  return { title, markdown };
}

export async function fetchWeb(value: string, options: { signal: AbortSignal; maxChars: number }, send: PublicHttp = requestPublic): Promise<FetchResult> {
  let url = publicUrl(value);
  const origin = url.origin;
  for (let redirects = 0; redirects <= 3; redirects++) {
    options.signal.throwIfAborted();
    const response = await send(url, { signal: options.signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 3 || !response.headers.location) throw new WebError('WEB_REDIRECT', '网页重定向次数超限或地址缺失');
      url = publicUrl(new URL(response.headers.location, url).href);
      if (url.origin !== origin) throw new WebError('WEB_REDIRECT', '不允许跨源网页重定向');
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new WebError('WEB_HTTP_ERROR', `网页请求失败（HTTP ${response.status}）`);
    const type = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!['text/html', 'text/plain'].includes(type)) throw new WebError('WEB_CONTENT_TYPE', '只支持 HTML 或纯文本网页');
    const content = type === 'text/html' ? extractMarkdown(response.text, url.href) : { markdown: response.text };
    return { url: url.href, ...content, markdown: content.markdown.slice(0, options.maxChars), truncated: content.markdown.length > options.maxChars };
  }
  throw new WebError('WEB_REDIRECT', '网页重定向失败');
}
