/**
 * 将本项目目录联接到 Yunzai/plugins/yunzai-chat-plugin，便于 npm run dev 热载。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const yunzaiPlugins = path.resolve(root, '../参考资料/Yunzai/plugins')
const target = path.join(yunzaiPlugins, 'yunzai-chat-plugin')

if (!fs.existsSync(yunzaiPlugins)) {
  console.error(`找不到 Yunzai plugins 目录：${yunzaiPlugins}`)
  process.exit(1)
}

const legacy = path.join(yunzaiPlugins, 'chat-plugin')
if (fs.existsSync(legacy) && path.resolve(fs.realpathSync(legacy)) === root) {
  if (fs.existsSync(target)) {
    console.error('旧 chat-plugin 联接和新目录同时存在，请先处理重复安装，避免双重加载。')
    process.exit(1)
  }
  fs.renameSync(legacy, target)
  console.log(`已将本项目旧联接改名：${target}`)
  process.exit(0)
}

const stat = fs.existsSync(target) ? fs.lstatSync(target) : null
if (stat?.isSymbolicLink() || stat?.isDirectory()) {
  const real = fs.existsSync(target) ? fs.realpathSync(target) : ''
  if (path.resolve(real) === path.resolve(root)) {
    console.log(`已链接：${target} -> ${root}`)
    process.exit(0)
  }
  // 空壳或旧目录：移走再链
  const backup = `${target}.bak-${Date.now()}`
  fs.renameSync(target, backup)
  console.log(`已将原目录移至 ${backup}`)
}

fs.symlinkSync(root, target, process.platform === 'win32' ? 'junction' : 'dir')
console.log(`已创建链接：${target} -> ${root}`)
console.log('在 Yunzai 目录执行：npm run dev')
