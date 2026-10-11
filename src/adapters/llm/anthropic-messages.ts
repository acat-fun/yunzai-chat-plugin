import { z } from 'zod';
import type { GenerationRequest, GenerationResult } from '../../application/ports/index.js';
import { postJson } from './transport.js';
import { encodeContent, textContent } from './content.js';
import { featureOptions } from './features.js';

const responseSchema = z.object({
  type: z.literal('message'), role: z.literal('assistant'), stop_reason: z.string(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()),
  usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).passthrough().optional(),
}).passthrough();

export async function createMessage(req: GenerationRequest, send: typeof fetch = fetch): Promise<GenerationResult> {
  const features = featureOptions(req);
  if (features.error) return { ok: false, code: 'UNSUPPORTED_FEATURE', message: features.error };
  const response = await postJson(req, 'messages', {
    model: req.model, max_tokens: features.maxTokens ?? req.maxTokens ?? 1024,
    system: req.messages.filter(m => m.role === 'system').map(m => textContent(m.content)).join('\n\n'),
    messages: req.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: encodeContent(m.content, 'anthropic') })),
    ...features.body,
  }, { 'anthropic-version': '2023-06-01', ...(req.apiKey ? { 'x-api-key': req.apiKey } : {}) }, send);
  if (!response.ok) return response;
  const parsed = responseSchema.safeParse(response.data);
  if (!parsed.success) return { ok: false, code: 'INVALID_RESPONSE', message: 'Messages 返回结构无效' };
  const data = parsed.data;
  if (data.content.some(c => c.type === 'server_tool_use' || c.type === 'web_search_tool_result'))
    return { ok: false, code: 'UNSUPPORTED_TOOL', message: '当前未启用此工具调用' };
  if (data.stop_reason === 'max_tokens') return { ok: false, code: 'TRUNCATED', message: 'Messages 输出达到 token 上限' };
  if (data.stop_reason === 'tool_use' || data.content.some(c => c.type === 'tool_use')) return { ok: false, code: 'UNSUPPORTED_TOOL', message: '当前未启用工具调用' };
  if (data.stop_reason === 'refusal') return { ok: false, code: 'REFUSAL', message: '模型拒绝了该请求' };
  if (!['end_turn', 'stop_sequence'].includes(data.stop_reason)) return { ok: false, code: 'GENERATION_FAILED', message: 'Messages 生成未完成' };
  const text = data.content.filter(c => c.type === 'text').map(c => c.text ?? '').join('\n').trim();
  if (!text) return { ok: false, code: 'EMPTY_CONTENT', message: '模型返回空内容' };
  return { ok: true, text, usage: { prompt: data.usage?.input_tokens, completion: data.usage?.output_tokens } };
}
