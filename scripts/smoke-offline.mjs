/**
 * 不启动 Yunzai：验证配置加载、命令与触发链路。
 */
import { getRuntime } from '../dist/bootstrap/runtime.js'

const runtime = getRuntime()
await runtime.ensureLoaded()

const base = {
  eventId: 'e1',
  messageId: 'm1',
  conversation: {
    adapterId: 'yunzai',
    platform: 'qq',
    botAccountId: '1',
    kind: 'private',
    conversationId: '10001',
  },
  sender: { platform: 'qq', userId: '10001', botAccountId: '1' },
  occurredAt: new Date().toISOString(),
  receivedAt: new Date().toISOString(),
  parts: [],
  isFromSelf: false,
  isAtBot: false,
  isHostMaster: true,
}

const help = await runtime.handleMessage({ ...base, rawText: '#chat帮助' })
if (!help.reply?.includes('chat-plugin')) throw new Error('帮助命令失败')

const owner = await runtime.handleMessage({ ...base, rawText: '#chat设置主人' })
if (!owner.reply?.includes('主人')) throw new Error('设置主人失败')

const status = await runtime.handleMessage({ ...base, rawText: '#chat状态' })
if (!status.reply?.includes('10001')) throw new Error('状态未反映主人')

const deny = await runtime.handleMessage({
  ...base,
  sender: { platform: 'qq', userId: '20002', botAccountId: '1' },
  conversation: { ...base.conversation, conversationId: '20002' },
  rawText: '#chat设置密钥 default-gateway sk-test',
})
if (!deny.reply?.includes('仅主人')) throw new Error('非主人应被拒绝')

console.log('offline smoke ok')
console.log(status.reply)
