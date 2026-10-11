import type { WebConfig } from '../../contracts/web.js';
import type { PluginConfig, ProtocolId } from '../../contracts/types.js';

export interface ConfigRepository {
  get(): PluginConfig;
  save(next: PluginConfig, expectedRevision?: string): Promise<PluginConfig>;
}
export interface SecretRepository {
  get(ref: string): Promise<string | undefined>;
  replace(id: string, value: string): Promise<{ ref: string; maskedHint: string }>;
}
export type ChatContent = string | Array<{ type: 'text'; text: string } | { type: 'image'; url: string }>;
export type ChatTurn = { role: 'user' | 'assistant' | 'system'; content: ChatContent; at: number };
export interface ContextRepository {
  get(key: string, maxCount: number, maxAgeMinutes: number): ChatTurn[];
  append(key: string, user: ChatContent, assistant: string, ttlSeconds: number): void;
}
export type GenerationRequest = {
  providerId?: string;
  protocol: ProtocolId;
  baseUrl: string; apiKey: string; model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: ChatContent }>;
  reasoningEnabled?: boolean;
  reasoningEffort?: string;
  reasoningMode?: 'auto' | 'deepseek' | 'anthropic-adaptive';
  maxTokens?: number; timeoutMs: number;
  signal?: AbortSignal;
  web?: { config: WebConfig; contextWindowTokens: number; revision: string };
};
export type GenerationResult =
  | { ok: true; text: string; usage?: { prompt?: number; completion?: number } }
  | { ok: false; code: string; message: string };
export interface LlmPort {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}
