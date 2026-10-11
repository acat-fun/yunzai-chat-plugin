import { z } from 'zod';
import type { GenerationRequest, GenerationResult } from '../../application/ports/index.js';
import { postJson } from './transport.js';
import { encodeContent } from './content.js';
import { featureOptions } from './features.js';

const responseSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.string(),
    message: z.object({ content: z.string().nullable().optional(), refusal: z.string().nullable().optional(), tool_calls: z.array(z.unknown()).optional() }).passthrough(),
  }).passthrough()).min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).passthrough().optional(),
}).passthrough();

export async function createChatCompletion(req: GenerationRequest, send: typeof fetch = fetch): Promise<GenerationResult> {
  const features = featureOptions(req);
  if (features.error) return { ok: false, code: 'UNSUPPORTED_FEATURE', message: features.error };
  const response = await postJson(req, 'chat/completions', {
    model: req.model, messages: req.messages.map(m => ({ role: m.role, content: encodeContent(m.content, 'chat') })),
    ...((req.reasoningMode !== 'deepseek' && new URL(req.baseUrl).hostname !== 'api.deepseek.com') &&
      (req.reasoningEnabled === true || (req.reasoningEffort && !['auto', 'off'].includes(req.reasoningEffort)))
      ? { max_completion_tokens: req.maxTokens } : { max_tokens: req.maxTokens }), store: false,
    ...features.body,
  }, req.apiKey ? { authorization: `Bearer ${req.apiKey}` } : {}, send);
  if (!response.ok) return response;
  const parsed = responseSchema.safeParse(response.data);
  if (!parsed.success) return { ok: false, code: 'INVALID_RESPONSE', message: 'Chat Completions 返回结构无效' };
  const choice = parsed.data.choices[0]!;
  if (choice.message.tool_calls?.length || choice.finish_reason === 'tool_calls') return { ok: false, code: 'UNSUPPORTED_TOOL', message: '当前未启用工具调用' };
  if (choice.message.refusal || choice.finish_reason === 'content_filter') return { ok: false, code: 'REFUSAL', message: '模型拒绝了该请求' };
  if (choice.finish_reason === 'length') return { ok: false, code: 'TRUNCATED', message: '输出达到 token 上限' };
  if (choice.finish_reason !== 'stop') return { ok: false, code: 'GENERATION_FAILED', message: '模型生成未完成' };
  const text = choice.message.content?.trim();
  if (!text) return { ok: false, code: 'EMPTY_CONTENT', message: '模型返回空内容' };
  return { ok: true, text, usage: { prompt: parsed.data.usage?.prompt_tokens, completion: parsed.data.usage?.completion_tokens } };
}
