import type { FetchResult, SearchResult } from '../../contracts/web.js';
export interface WebPort {
  search(query: string, signal: AbortSignal): Promise<SearchResult>;
  fetch(url: string, maxChars: number, signal: AbortSignal): Promise<FetchResult>;
}
export type ToolCall = { id: string; name: string; arguments: unknown };
export type AgentTurn =
  | { kind: 'assistant'; calls: ToolCall[]; replay: unknown[] }
  | { kind: 'results'; results: Array<{ id: string; content: string; error: boolean }> };
export type AgentStep =
  | { ok: true; text: string; calls: ToolCall[]; replay: unknown[] }
  | { ok: false; code: string; message: string };
export interface AgentModelPort {
  next(turns: AgentTurn[], toolsEnabled: boolean, signal: AbortSignal): Promise<AgentStep>;
}
