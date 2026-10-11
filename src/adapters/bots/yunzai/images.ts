const MAX_BYTES = 5 * 1024 * 1024;
function imageData(bytes: Buffer): string {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('image size');
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' :
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' :
    /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()) ? 'image/gif' :
    bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
  if (!mime) throw new Error('image format');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/** 图片只从 QQ 固定 CDN 下载，不读取事件中的本机路径、任意主机或重定向。 */
export async function resolveYunzaiImage(value: string, send: typeof fetch = fetch, signal?: AbortSignal): Promise<string> {
  const base64 = /^(?:base64:\/\/|data:image\/(?:jpeg|png|webp|gif);base64,)([A-Za-z0-9+/=]+)$/.exec(value);
  if (base64) {
    if (base64[1]!.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error('image size');
    return imageData(Buffer.from(base64[1]!, 'base64'));
  }
  // CQ 字符串中的查询分隔符可能仍是 &amp;，下载前恢复实际参数。
  const url = new URL(value.replace(/&amp;/g, '&'));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
    !(url.hostname.endsWith('.qpic.cn') || ['qpic.cn', 'multimedia.nt.qq.com', 'multimedia.nt.qq.com.cn', 'image.qq.com'].includes(url.hostname))) throw new Error('untrusted image URL');
  const response = await send(url, { redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('image download');
  const reader = response.body.getReader();
  const chunks: Buffer[] = []; let size = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error('image size');
      chunks.push(Buffer.from(chunk));
    }
  } finally { await reader.cancel(); }
  return imageData(Buffer.concat(chunks));
}
