import type { ProtocolId } from '../types'

/** 草稿只使用用户实际输入的密钥，不使用脱敏提示。 */
export async function discoverDraftModels(input: { baseUrl: string; protocol: ProtocolId; apiKey?: string; needsKey: boolean }) {
  if (input.needsKey && !input.apiKey) throw new Error('请输入真实 API 密钥，或先保存供应商后由后端获取模型。')
  let url: URL
  try {
    url = new URL(input.baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error()
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`
  } catch { throw new Error('请输入有效的 HTTP(S) API 基础地址。') }
  const headers: Record<string, string> = { accept: 'application/json' }
  if (input.protocol === 'anthropic-messages') headers['anthropic-version'] = '2023-06-01'
  if (input.apiKey) {
    if (input.protocol === 'anthropic-messages') headers['x-api-key'] = input.apiKey
    else headers.authorization = `Bearer ${input.apiKey}`
  }
  let response: Response
  try {
    response = await fetch(url, { headers, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) })
  } catch { throw new Error('浏览器无法连接供应商（网络超时或不允许跨域）；请保存供应商后由后端获取模型。') }
  if (response.status === 401 || response.status === 403) throw new Error('供应商拒绝凭据，请检查 API 密钥。')
  if (!response.ok) throw new Error(`获取模型失败（HTTP ${response.status}）。`)
  const payload = await response.json().catch(() => null)
  if (!payload || !Array.isArray(payload.data)) throw new Error('供应商返回的模型列表格式无效。')
  const models: Array<{ id: string; displayName: string }> = []
  const seen = new Set<string>()
  for (const item of payload.data) {
    if (typeof item?.id !== 'string' || !item.id.trim() || seen.has(item.id.trim())) continue
    const id = item.id.trim()
    seen.add(id)
    models.push({ id, displayName: typeof item.name === 'string' ? item.name.trim() || id : id })
    if (models.length >= 2000) break
  }
  return { models, truncated: models.length >= 2000 }
}
