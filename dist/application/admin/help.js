export function getHelpContent(installName = 'yunzai-chat-plugin') {
    const groups = [
        { title: '聊天与查看', items: [
                { command: '#chat对话 内容', description: '向机器人提问，也可用 #chat 内容' },
                { command: '@机器人 内容', description: '群内提问；其他插件命令仍交给原插件' },
                { command: '#chat帮助', description: '显示图片帮助，渲染不可用时返回文字' },
                { command: '#chat状态', description: '查看聊天开关和当前模型' },
            ] },
        { title: '主人配置 · 私聊', items: [
                { command: '#chat设置主人 用户ID', description: '首次由宿主主人初始化；后续由插件主人更换' },
                { command: '#chat设置密钥 提供商ID 密钥', description: '配置 API 密钥，回复仅显示脱敏值' },
                { command: '#chat设置默认模型 提供商ID 模型ID', description: '选择已添加的模型' },
                { command: '#chat设置 默认 私聊始终回复 true', description: '设置默认行为；支持 JSON 类型值' },
                { command: '#chat设置 默认 上下文条数 8', description: '修改消息历史窗口' },
                { command: '#chat设置 默认 后备模型 ["供应商ID|模型ID"]', description: '设置余额不足时按顺序切换的后备模型；[] 关闭' },
                { command: '#chat设置 模型 提供商ID 模型ID 联网 true', description: '开启联网搜索，原生优先、失败后自带搜索回退；false 关闭' },
                { command: '#chat设置 模型 提供商ID 模型ID 推理 true', description: '开启模型推理；思考强度在基本配置中设置' },
                { command: '#chat设置白名单 用户ID,用户ID', description: '限制聊天用户，留空清空名单' },
                { command: '#chat设置黑名单 用户ID,用户ID', description: '排除聊天用户，黑名单优先' },
                { command: '#chat开 / #chat关', description: '开启或关闭自动聊天' },
                { command: '#chat面板', description: '查看管理面板地址' },
            ] },
        { title: 'Yunzai 原生命令 · 宿主主人', items: [
                { command: `#更新${installName}`, description: '拉取插件更新并由 Yunzai 处理重启' },
                { command: `#更新日志${installName}`, description: '查看插件 Git 更新日志' },
            ] },
    ];
    return { title: 'chat-plugin', subtitle: '聊天 · 配置 · 更新', groups };
}
export function getHelpText(installName = 'yunzai-chat-plugin') {
    const help = getHelpContent(installName);
    return [help.title, ...help.groups.flatMap(g => [g.title, ...g.items.map(i => `${i.command}\n  ${i.description}`)])].join('\n');
}
//# sourceMappingURL=help.js.map