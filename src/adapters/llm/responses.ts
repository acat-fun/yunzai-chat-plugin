import { z } from 'zod';
import type { GenerationRequest, GenerationResult } from '../../application/ports/index.js';
import { postJson } from './transport.js';
import { encodeContent, textContent } from './content.js';
import { featureOptions } from './features.js';

const responseSchema = z.object({
  status: z.string(), error: z.unknown().optional(),
  output: z.array(z.object({
    type: z.string(), role: z.string().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional(),
  }).passthrough()),
  usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).passthrough().optional(),
}).passthrough();

export async function createResponse(req: GenerationRequest, send: typeof fetch = fetch): Promise<GenerationResult> {
  const features = featureOptions(req);
  if (features.error) return { ok: false, code: 'UNSUPPORTED_FEATURE', message: features.error };
  const response = await postJson(req, 'responses', {
    model: req.model, store: false,
    instructions: req.messages.filter(m => m.role === 'system').map(m => textContent(m.content)).join('\n\n'),
    input: req.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: encodeContent(m.content, 'responses', m.role === 'assistant') })),
    max_output_tokens: req.maxTokens,
    ...features.body,
  }, req.apiKey ? { authorization: `Bearer ${req.apiKey}` } : {}, send);
  if (!response.ok) return response;
  const parsed = responseSchema.safeParse(response.data);
  if (!parsed.success) return { ok: false, code: 'INVALID_RESPONSE', message: 'Responses 返回结构无效' };
  const data = parsed.data;
  if (data.error || data.status !== 'completed') {
    return { ok: false, code: data.status === 'incomplete' ? 'TRUNCATED' : 'GENERATION_FAILED', message: 'Responses 生成未完成' };
  }
  if (data.output.some(item => item.type.endsWith('_call'))) return { ok: false, code: 'UNSUPPORTED_TOOL', message: '当前未启用此工具调用' };
  const messages = data.output.filter(item => item.type === 'message' && item.role === 'assistant');
  if (messages.some(m => m.content?.some(c => c.type === 'refusal'))) return { ok: false, code: 'REFUSAL', message: '模型拒绝了该请求' };
  const text = messages.flatMap(m => m.content ?? []).filter(c => c.type === 'output_text').map(c => c.text ?? '').join('\n').trim();
  if (!text) return { ok: false, code: 'EMPTY_CONTENT', message: '模型返回空内容' };
  return { ok: true, text, usage: { prompt: data.usage?.input_tokens, completion: data.usage?.output_tokens } };
}
