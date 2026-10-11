import MarkdownIt from 'markdown-it';
import type { PluginWithOptions } from 'markdown-it';
import katex from 'katex';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { paths } from '../../storage/paths.js';

const require = createRequire(import.meta.url);
const texmath = require('markdown-it-texmath') as PluginWithOptions<{
  engine: typeof katex;
  delimiters: string[];
  katexOptions: { trust: boolean; throwOnError: boolean; maxExpand: number; maxSize: number };
}>;
const markdown = new MarkdownIt({ html: false, breaks: true }).use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'brackets'],
  katexOptions: { trust: false, throwOnError: false, maxExpand: 1000, maxSize: 20 },
});
// 模型提供的远程图片不在截图中加载；图片说明保留为文字。
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index]!.content);
type Tokens = ReturnType<MarkdownIt['parse']>;

function hasComplexContent(tokens: Tokens): boolean {
  return tokens.some(token => token.type === 'table_open' || token.type.startsWith('math_') ||
    (token.type === 'fence' && (token.info.trim().split(/\s+/)[0] === 'mindmap' ||
      (token.info.trim().split(/\s+/)[0] === 'mermaid' && /^\s*mindmap(?:\s|$)/.test(token.content)))) ||
    Boolean(token.children && hasComplexContent(token.children)));
}

function inlineText(tokens: Tokens): string {
  let text = '';
  const links: string[] = [];
  for (const token of tokens) {
    if (token.type === 'softbreak' || token.type === 'hardbreak') text += '\n';
    else if (token.type === 'link_open') links.push(token.attrGet('href') ?? '');
    else if (token.type === 'link_close') {
      const url = links.pop();
      if (url && !text.endsWith(url)) text += ` (${url})`;
    } else if (token.type === 'image') {
      text += `${token.content}${token.attrGet('src') ? ` (${token.attrGet('src')})` : ''}`;
    }
    else if (token.nesting === 0) text += token.content;
  }
  return text;
}

function plainText(tokens: Tokens): string {
  let text = '', table = false;
  const lists: Array<{ ordered: boolean; next: number }> = [];
  for (const token of tokens) {
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      lists.push({ ordered: token.type === 'ordered_list_open', next: Number(token.attrGet('start') ?? 1) });
    } else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') lists.pop();
    else if (token.type === 'list_item_open') {
      const list = lists.at(-1)!;
      text += `${'  '.repeat(Math.max(0, lists.length - 1))}${list.ordered ? `${list.next++}.` : '•'} `;
    } else if (token.type === 'table_open') table = true;
    else if (token.type === 'table_close') { table = false; text += '\n'; }
    else if (token.type === 'th_close' || token.type === 'td_close') text += '\t';
    else if (token.type === 'tr_close') text = text.trimEnd() + '\n';
    else if (token.type === 'inline') {
      text += inlineText(token.children ?? []) + (table ? '' : lists.length ? '\n' : '\n\n');
    } else if (token.type === 'fence' || token.type === 'code_block' || token.type.startsWith('math_block')) {
      text += token.content + '\n\n';
    } else if (token.type === 'hr') text += '────────\n';
  }
  return text.trim();
}

/** 普通 Markdown 转全文文字；仅表格、思维导图和公式触发宿主截图。 */
export function formatYunzaiReply(text: string): { text: string; html: string | null; hasMath: boolean } {
  const tokens = markdown.parse(text, {});
  const complex = hasComplexContent(tokens);
  return {
    text: plainText(tokens) || text,
    html: complex ? markdown.renderer.render(tokens, markdown.options, {}) : null,
    hasMath: tokens.some(token => token.type.startsWith('math_') ||
      Boolean(token.children?.some(child => child.type.startsWith('math_')))),
  };
}

let mathStyles: Promise<string> | undefined;
async function loadMathStyles(): Promise<string> {
  mathStyles ??= (async () => {
    const file = require.resolve('katex/dist/katex.min.css');
    const css = await readFile(file, 'utf8');
    const fonts = new Map<string, string>();
    await Promise.all([...new Set([...css.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)].map(match => match[1]!))]
      .map(async font => fonts.set(font, (await readFile(path.join(path.dirname(file), font))).toString('base64'))));
    // 字体内嵌，不依赖在线 CDN，也不向外请求模型返回的 URL。
    return css.replace(/src:[^;}]+/g, source => {
      const font = /url\((fonts\/[^)]+\.woff2)\)/.exec(source)?.[1];
      return font ? `src:url("data:font/woff2;base64,${fonts.get(font)}") format("woff2")` : source;
    });
  })();
  try { return await mathStyles; } catch (error) { mathStyles = undefined; throw error; }
}

type ReplyEvent = {
  runtime?: { render(plugin: string, template: string, data: Record<string, unknown>, options: {
    retType: string;
    beforeRender(context: { data: Record<string, unknown> }): Record<string, unknown>;
  }): Promise<unknown> };
  reply(message: unknown): Promise<unknown>;
};

/** 部分宿主将分页结果放在 image.file 数组内，发送前还原为多张图片。 */
function imageMessages(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    const pages = value.map(imageMessages);
    return pages.length && pages.every(page => page.length) ? pages.flat() : [];
  }
  if (Buffer.isBuffer(value)) return value.length ? [{ type: 'image', file: value }] : [];
  if (typeof value === 'string' && value.startsWith('base64://') && value.length > 9) return [{ type: 'image', file: value }];
  if (value && typeof value === 'object' && 'type' in value && value.type === 'image' && 'file' in value) {
    if (Array.isArray(value.file)) return imageMessages(value.file);
    if (Buffer.isBuffer(value.file) ? value.file.length > 0 : typeof value.file === 'string' && value.file.length > 0) return [value];
  }
  return [];
}

export async function sendYunzaiReply(event: ReplyEvent, reply: string): Promise<unknown> {
  const formatted = formatYunzaiReply(reply);
  if (!formatted.html || !event.runtime?.render) return event.reply(formatted.text);
  let images: unknown[] = [];
  try {
    const templateFile = path.join(paths.root, 'resources/reply/index.html');
    images = imageMessages(await event.runtime.render(path.basename(paths.root), 'reply/index', {
      html: formatted.html,
      mathStyles: formatted.hasMath ? await loadMathStyles() : '',
      tplFile: templateFile,
      saveId: randomUUID(),
      multiPage: true,
      multiPageHeight: 4000,
    }, {
      retType: 'base64',
      beforeRender: ({ data }) => ({ ...data, tplFile: templateFile }),
    }));
  } catch {
    console.warn('[chat-plugin] 回复图片渲染失败，已回退全文文字。');
  }
  if (!images.length) return event.reply(formatted.text);
  return event.reply(images.length === 1 ? images[0] : images);
}
