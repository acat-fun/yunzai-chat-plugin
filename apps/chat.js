/**
 * Yunzai 插件类：事件桥接 + 启动真实管理面板。
 */
import { getRuntime } from '../dist/bootstrap/runtime.js'
import { normalizeYunzaiEvent, enrichYunzaiReply } from '../dist/adapters/bots/yunzai/normalize.js'
import { acceptsPassiveChat } from '../dist/adapters/bots/yunzai/routing.js'
import { sendYunzaiHelp } from '../dist/adapters/bots/yunzai/help.js'
import { sendYunzaiReply } from '../dist/adapters/bots/yunzai/reply.js'
import { isOwner } from '../dist/domain/permission/access.js'

export class ChatPlugin extends plugin {
  constructor() {
    super({
      name: 'chat-plugin',
      dsc: 'OpenAI / Anthropic 兼容自动聊天',
      event: 'message',
      priority: 2000,
      rule: [
        { reg: '^#chat帮助\\s*$', fnc: 'onHelp', log: false },
        { reg: '^#chat状态$', fnc: 'onMessage' },
        { reg: '^#chat(面板|登录)$', fnc: 'onPanel' },
        { reg: '^#chat(开|关)$', fnc: 'onMessage' },
        { reg: '^#chat设置', fnc: 'onMessage', log: false },
        { reg: '^#chat对话', fnc: 'onMessage' },
        { reg: '^#chat(\\s|$)', fnc: 'onMessage' },
        { reg: '^#chat', fnc: 'onMessage', log: false },
      ],
    })
    this.runtime = getRuntime()
    this.runtime.setDiagnosticLogger(message => logger.warn(message))
  }

  async init() {
    try {
      const url = await this.runtime.startPanel()
      if (url) {
        logger.mark(`[chat-plugin] 自带管理面板已启动：${url}`)
      } else {
        logger.mark('[chat-plugin] 自带面板未启用（admin.standalone.enabled=false）')
      }
      this.addCleanup?.(
        async () => {
          await this.runtime.stop()
          logger.mark('[chat-plugin] 管理面板已停止')
        },
        async () => {
          await this.runtime.startPanel()
        },
      )
    } catch (error) {
      logger.error(`[chat-plugin] 管理面板启动失败：${error?.message || error}`)
    }
  }

  async accept(e) {
    const incoming = normalizeYunzaiEvent(e)
    if (!acceptsPassiveChat(incoming)) return false
    // TRSS 的普通 truthy 返回值只跳出 accept 循环；return 才会结束本次派发。
    return await this.dispatch(e, incoming) ? 'return' : false
  }

  async onHelp(e) {
    return sendYunzaiHelp(e)
  }

  async onMessage(e) {
    return this.dispatch(e)
  }

  async onPanel(e) {
    await this.runtime.ensureLoaded()
    const incoming = normalizeYunzaiEvent(e)
    if (incoming.conversation.kind !== 'private' || !isOwner(this.runtime.configStore.get(), incoming.sender.userId, incoming.sender.platform)) {
      return e.reply('管理面板入口请由插件主人在私聊中查看。')
    }
    const url = this.runtime.getPanelUrl()
    if (!url) return e.reply('自带面板未启动，请检查 admin.standalone.enabled 和启动日志。')
    let code
    try { code = this.runtime.issuePanelLoginCode() }
    catch (error) { return e.reply(error.message) }
    return e.reply(`管理面板监听：${url}\n登录验证码：${code}（5 分钟有效，仅可使用一次）\n\n127.0.0.1 只在运行机器人所在环境可访问；Docker 外部访问需绑定 0.0.0.0 并映射端口，浏览器使用宿主机地址。`)
  }

  async dispatch(e, incoming = normalizeYunzaiEvent(e)) {
    try {
      if (incoming.isFromSelf || !incoming.rawText.trim()) return false
      let sent = false
      const result = await this.runtime.handleMessage(await enrichYunzaiReply(e, incoming), async reply => {
        const receipt = reply.renderMarkdown ? await sendYunzaiReply(e, reply.reply) : await e.reply(reply.reply)
        if (receipt === false) throw new Error('消息发送失败')
        sent = true
      })
      if (sent) return true
      // 兼容仅返回回复的宿主测试或外部运行时适配器。
      if (result.reply) {
        if (result.renderMarkdown) await sendYunzaiReply(e, result.reply)
        else await e.reply(result.reply)
        return true
      }
      return false
    } catch (error) {
      logger.error(`[chat-plugin] 处理失败：${error?.message || error}`)
      await e.reply('chat-plugin 处理出错，请查看日志。')
      return true
    }
  }
}

export default ChatPlugin
