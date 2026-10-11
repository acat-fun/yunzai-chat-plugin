/**
 * Yunzai 插件入口：扫描 apps/ 并导出插件类。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const appsDir = path.join(root, 'apps')
const files = fs.readdirSync(appsDir).filter((file) => file.endsWith('.js'))

const loaded = await Promise.allSettled(files.map((file) => import(`./apps/${file}`)))
const apps = {}

for (let i = 0; i < files.length; i++) {
  const name = files[i].replace(/\.js$/, '')
  const result = loaded[i]
  if (result.status !== 'fulfilled') {
    globalThis.logger?.error?.(`[chat-plugin] 载入 ${name} 失败`, result.reason)
    continue
  }
  const mod = result.value
  const exported = mod.default ?? mod[Object.keys(mod)[0]]
  if (!exported) {
    globalThis.logger?.warn?.(`[chat-plugin] ${name} 未导出插件类`)
    continue
  }
  apps[name] = exported
}

globalThis.logger?.mark?.(`[chat-plugin] 已载入 ${Object.keys(apps).length} 个模块`)

export { apps }
