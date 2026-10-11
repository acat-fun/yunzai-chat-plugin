import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const host = path.resolve(project, '../参考资料/Yunzai')
const installName = process.argv[2] || 'yunzai-chat-plugin'
assert.match(installName, /^[a-z][a-z0-9-]*$/)
// 执行已核对的本地宿主类定义，只调用目录发现方法；不拉取、重置或重启宿主。
const source = (await fs.readFile(path.join(host, 'plugins/other/update.js'), 'utf8'))
  .replace(/^import .*$/gm, '').replace('export class update', 'class update')
const NativeUpdater = vm.runInNewContext(`${source}\nupdate`, {
  plugin: class { constructor(config) { Object.assign(this, config) } },
  Bot: { fsStat: async relative => fs.stat(path.join(host, relative)).catch(() => null) },
})
const updater = new NativeUpdater()
updater.e = { msg: `#更新${installName}` }
assert.equal(await updater.getPlugin(), installName)
updater.e.msg = `#更新日志${installName}`
assert.equal(await updater.getPlugin(), installName)
assert.equal(await updater.getPlugin(installName), installName)
console.log(`本地 TRSS 原生更新、日志、全部更新的插件发现均识别 ${installName}。未执行 git pull 或宿主重启。`)
