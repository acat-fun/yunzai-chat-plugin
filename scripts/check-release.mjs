import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const walk = async directory => {
  const result = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await walk(file))
    else result.push(file)
  }
  return result
}
for (const source of await walk(path.join(root, 'src'))) {
  if (!source.endsWith('.ts')) continue
  const output = path.join(root, 'dist', path.relative(path.join(root, 'src'), source).replace(/\.ts$/, '.js'))
  await fs.access(output)
}
for (const file of ['apps/chat.js', 'resources/help/index.html', 'resources/reply/index.html', 'config/defaults/plugin.yml', 'admin-ui/dist/index.html']) {
  await fs.access(path.join(root, file))
}
const frontend = await fs.readFile(path.join(root, 'admin-ui/dist/index.html'), 'utf8')
for (const match of frontend.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)/g)) {
  await fs.access(path.join(root, 'admin-ui/dist', match[1]))
}
console.log('运行产物与帮助模板完整；Git 更新无需现场编译。')
