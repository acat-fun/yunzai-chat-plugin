export type ProtocolId =
  | 'openai-responses'
  | 'openai-chat-completions'
  | 'anthropic-messages'

export type ModelConfig = {
  id: string
  displayName: string
  contextWindowTokens?: number
  maxOutputTokens?: number
  toolCalling?: boolean
  inputTypes: Array<'text' | 'image' | 'file'>
  reasoningEnabled?: boolean
  reasoningMode?: 'auto' | 'deepseek' | 'anthropic-adaptive'
  open?: boolean
}

export type ProviderConfig = {
  id: string
  displayName: string
  enabled: boolean
  baseUrl: string
  protocol: ProtocolId
  auth: {
    mode: 'api-key' | 'none'
    configured: boolean
    maskedHint: string
    replaceSecret?: string
  }
  models: ModelConfig[]
}

export type PromptConfig = {
  id: string
  name: string
  enabled: boolean
  content: string
}

export type DefaultsConfig = {
  route: string
  fallbackRoutes: string[]
  prompt: string
  regex: string
  alwaysPrivate: boolean
  reasoning: string
  webEnabled: boolean
  replyImages: boolean
  replyFiles: boolean
  contextCount: number
  contextAgeMinutes: number
  groupRandom: boolean
  replyProbability: number
}

export type PolicyConfig = {
  id: string
  name: string
  enabled: boolean
  priority: number
  bindUsers: string[]
  whitelistUsers: string[]
  blacklistUsers: string[]
  kind: 'all' | 'private' | 'group'
  groupIds: string[]
  overrides: Partial<DefaultsConfig>
}

export type AdminEntry = {
  id: string
  enabled: boolean
  userId: string
  name: string
  kind: 'all' | 'private' | 'group'
  groupIds: string[]
  blacklistUsers: string[]
}

export type WebProviderConfig = {
  id: string
  type: 'deepseek-native' | 'exa' | 'perplexity' | 'searxng'
  enabled: boolean
  baseUrl: string
  model?: string
  maxUses: number
  auth: { configured: boolean; maskedHint: string; replaceSecret?: string; clearSecret?: boolean }
}
export type WebConfig = {
  engineOrder: Array<'exa-mcp' | 'duckduckgo' | 'bing' | 'searxng' | 'exa'>
  enabled: boolean
  searchProviderId: string
  providers: WebProviderConfig[]
  searchTimeoutSeconds: number
  fetchTimeoutSeconds: number
  maxFetchChars: number
  maxToolCalls: number
  maxToolRounds: number
  agentTimeoutSeconds: number
}
export type PublicConfig = {
  schemaVersion: number
  revision: string
  plugin: { enabled: boolean }
  admin: {
    mode: 'guoba' | 'standalone'
    guoba: { enabled: boolean; trustHostAdministrators: boolean }
    standalone: {
      enabled: boolean
      host: string
      port: number
      auth: { mode: string; configured: boolean }
    }
  }
  web: WebConfig
  providers: ProviderConfig[]
  prompts: PromptConfig[]
  defaults: DefaultsConfig
  policies: PolicyConfig[]
  access: {
    owner: { platform: string; userId: string; name?: string }
    admins: AdminEntry[]
    chatWhitelist: string[]
    chatBlacklist: string[]
  }
}

export type PageId = 'api' | 'basic' | 'access'
export type BasicTab = 'defaults' | 'prompts' | 'policies'
