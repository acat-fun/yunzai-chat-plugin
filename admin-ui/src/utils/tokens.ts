/** 将 128000 显示为 128K；空值表示未确认 */
export function formatTokens(value?: number): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return ''
  if (value % 1_000_000 === 0) return `${value / 1_000_000}M`
  if (value % 1000 === 0) return `${value / 1000}K`
  return String(value)
}

/** 解析正整数或 K/M 简写；空串返回 undefined；非法返回 null */
export function parseTokens(raw: string): number | undefined | null {
  const text = String(raw || '').trim()
  if (!text) return undefined
  const match = text.match(/^([1-9]\d*(?:\.\d+)?)([kKmM])?$/)
  if (!match) return null
  let n = Number(match[1])
  const unit = match[2]?.toLowerCase()
  if (unit === 'k') n *= 1000
  if (unit === 'm') n *= 1_000_000
  return Math.round(n)
}
