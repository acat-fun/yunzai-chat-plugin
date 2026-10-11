import { z } from 'zod';
import { WebError } from '../../contracts/web.js';
import type { PublicHttp, HttpDocument } from './http-fetch.js';

function rpcResult(response: HttpDocument, id: number): unknown {
  if (response.status !== 200)
    throw new WebError(`WEB_HTTP_${response.status}`, '搜索 MCP 请求失败');
  const type = String(response.headers['content-type'] ?? '');
  let messages: unknown[];
  try {
    if (type.includes('text/event-stream')) {
      messages = response.text
        .replace(/\r\n/g, '\n')
        .split('\n\n')
        .map((event) =>
          event
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n'),
        )
        .filter(Boolean)
        .map((data) => JSON.parse(data));
    } else if (type.includes('application/json'))
      messages = [JSON.parse(response.text)];
    else throw new Error('unknown format');
  } catch {
    throw new WebError('WEB_INVALID_RESPONSE', '搜索 MCP 传输格式无效');
  }
  for (const message of messages) {
    const parsed = z
      .object({
        jsonrpc: z.literal('2.0'),
        id: z.literal(id),
        result: z.unknown().optional(),
        error: z.unknown().optional(),
      })
      .passthrough()
      .safeParse(message);
    if (!parsed.success) continue;
    if (parsed.data.error || !Object.hasOwn(parsed.data, 'result'))
      throw new WebError('WEB_SEARCH_FAILED', '搜索 MCP 请求失败');
    return parsed.data.result;
  }
  throw new WebError('WEB_INVALID_RESPONSE', '搜索 MCP 未返回对应请求结果');
}

export async function callSearchMcp(
  url: URL,
  name: string | string[],
  args: Record<string, unknown>,
  signal: AbortSignal,
  send: PublicHttp,
  authHeaders: Record<string, string> = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    ...authHeaders,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  const post = (body: unknown) =>
    send(url, {
      method: 'POST',
      headers: { ...headers },
      body: JSON.stringify(body),
      signal,
    });
  const initialized = await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'yunzai-chat-plugin', version: '0.1.0' },
    },
  });
  const handshake = z
    .object({ protocolVersion: z.string() })
    .passthrough()
    .safeParse(rpcResult(initialized, 1));
  if (
    !handshake.success ||
    !['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'].includes(
      handshake.data.protocolVersion,
    )
  ) {
    throw new WebError('WEB_INVALID_RESPONSE', '搜索 MCP 协议版本不兼容');
  }
  headers['mcp-protocol-version'] = handshake.data.protocolVersion;
  const session = initialized.headers['mcp-session-id'];
  if (typeof session === 'string') headers['mcp-session-id'] = session;
  try {
    const notified = await post({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    if (notified.status < 200 || notified.status >= 300)
      throw new WebError('WEB_HTTP_ERROR', '搜索 MCP 初始化失败');
    let toolName: string;
    let callId = 2;
    let toolArgs = args;
    if (Array.isArray(name)) {
      const listed = z
        .object({
          tools: z.array(
            z.object({
              name: z.string(),
              inputSchema: z
                .object({ properties: z.record(z.unknown()).optional() })
                .optional(),
            }),
          ),
        })
        .safeParse(
          rpcResult(
            await post({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/list',
              params: {},
            }),
            2,
          ),
        );
      const matched = listed.success
        ? listed.data.tools.find((tool) => name.includes(tool.name))
        : undefined;
      if (!matched)
        throw new WebError(
          'WEB_SEARCH_UNSUPPORTED',
          '搜索 MCP 未注册受支持的搜索工具',
        );
      toolName = matched.name;
      const properties = matched.inputSchema?.properties;
      if (properties) {
        // 厂商工具版本分别使用 query/search_query；依照声明映射，避免反复盲试。
        const mapped = { ...args };
        if (
          'query' in properties &&
          !('search_query' in properties) &&
          typeof args.search_query === 'string'
        ) {
          mapped.query = args.search_query;
        }
        toolArgs = Object.fromEntries(
          Object.entries(mapped).filter(([key]) => key in properties),
        );
      }
      callId = 3;
    } else toolName = name;
    const response = await post({
      jsonrpc: '2.0',
      id: callId,
      method: 'tools/call',
      params: { name: toolName, arguments: toolArgs },
    });
    return rpcResult(response, callId);
  } finally {
    // 无状态服务没有会话 ID；有状态服务的短连接在本次请求后主动关闭。
    if (typeof session === 'string' && !signal.aborted) {
      await send(url, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
      }).catch(() => undefined);
    }
  }
}
