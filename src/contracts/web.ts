export type WebProviderConfig = {
  id: string;
  type: 'deepseek-native' | 'exa' | 'perplexity' | 'searxng';
  enabled: boolean;
  baseUrl: string;
  model?: string;
  maxUses: number;
  auth: { secretRef: string; maskedHint: string };
};
export type WebConfig = {
  engineOrder: SearchEngine[];
  enabled: boolean;
  searchProviderId: string;
  providers: WebProviderConfig[];
  searchTimeoutSeconds: number;
  fetchTimeoutSeconds: number;
  maxFetchChars: number;
  maxToolCalls: number;
  maxToolRounds: number;
  agentTimeoutSeconds: number;
};
export type SearchEngine = 'exa-mcp' | 'duckduckgo' | 'bing' | 'searxng' | 'exa';
export type SearchSource = { url: string; title?: string; snippet?: string; publishedAt?: string };
export type SearchBackend = SearchEngine | 'model-native';
export type SearchResult = { nativeProvider?: string; sources: SearchSource[]; truncated: boolean; engine?: SearchBackend; failures?: Array<{ engine: SearchBackend; code: string }> };
export type FetchResult = { url: string; title?: string; markdown: string; truncated: boolean };
export class WebError extends Error {
  constructor(readonly code: string, message: string, readonly diagnostic?: string) { super(message); }
}
