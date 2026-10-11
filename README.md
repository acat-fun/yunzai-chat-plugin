# yunzai-chat-plugin

面向 Yunzai / TRSS-Yunzai 的多用户聊天 Agent 插件。以 LangGraph.js 管理工具调用，支持多供应商模型、图片理解、联网搜索和余额不足时自动切换模型，通过独立管理面板或锅巴配置。

## 安装

需要 Node.js 20 或以上版本，以及已运行的 Yunzai / TRSS-Yunzai。在 Yunzai 根目录执行：

```bash
git clone https://github.com/acat-fun/yunzai-chat-plugin.git plugins/yunzai-chat-plugin
cd plugins/yunzai-chat-plugin
npm install --omit=dev
```

重启 Yunzai 后，由 Yunzai 主人在私聊中发送：

```text
#chat设置主人 你的QQ号
#chat登录
```

使用返回的验证码登录管理面板，添加供应商 API 地址、密钥和模型，再选择默认模型。默认面板地址为 `http://127.0.0.1:50931`，验证码仅可使用一次，五分钟内有效。

容器或远程部署时，将配置中的 `admin.standalone.host` 设置为 `0.0.0.0`，映射面板端口，并使用服务器的实际地址访问。登录页也支持获取控制台登录口令。

仓库包含运行产物，无须现场编译：根目录 `dist/` 用于插件运行，`admin-ui/dist/` 用于独立面板。

## 配置模型

在面板的 **API 配置** 中添加供应商，并维护该供应商的模型目录。支持以下调用协议：

| 协议 | 适用接口 |
| --- | --- |
| OpenAI Chat Completions | OpenAI 兼容接口及多数第三方网关 |
| OpenAI Responses | 支持 Responses 的接口 |
| Anthropic Messages | Claude 及 Anthropic 兼容接口 |

模型可配置工具调用、推理、上下文窗口、输出上限和输入能力。能力开关应与实际接口一致；插件不会让不支持图片的模型接收图片。

在 **基本配置** 中选择默认模型，并按顺序添加后备模型。当供应商明确返回余额或额度不足时，插件会用原对话自动尝试后备模型；普通限流、认证失败、网络错误不会触发余额切换。同一账户不会重复尝试，缺少当前对话所需图片或工具能力的候选会跳过。

切换成功后继续保存当前会话，下一次请求仍先尝试默认模型，充值后即可恢复使用。最多可设置十个后备模型。

也可以通过命令设置：

```text
#chat设置密钥 default-gateway 你的API密钥
#chat设置默认模型 default-gateway deepseek-chat
#chat设置 默认 后备模型 ["备用供应商ID|模型ID"]
```

## 聊天与权限

```text
#chat对话 你好
#chat帮助
#chat面板
```

群聊中也可以通过 @机器人发起对话。上下文按用户和会话隔离；权限、启用范围、黑白名单和提示词均可在面板配置。图片理解支持本条消息附带的图片和明确引用的图片，需要使用支持图片输入的模型。

回复支持 Markdown；表格、公式和思维导图等内容可借助宿主截图能力渲染，渲染不可用时回退文本。

锅巴配置入口默认开启，并默认信任宿主管理员，可在面板的 **权限与启用** 中关闭或调整。

## 联网搜索

在模型配置中开启 **支持工具调用（联网）** 即可，无须单独配置搜索页面或搜索密钥。主模型决定何时调用 `web_search` 查找信息、何时调用 `web_fetch` 阅读网页。

搜索优先尝试当前模型供应商的原生搜索，失败后依次尝试内置 Exa MCP、DuckDuckGo 和 Bing 搜索。原生搜索适配覆盖 DeepSeek、Claude、OpenAI / ChatGPT、Grok、GLM、Kimi / Moonshot、Qwen、Gemini、豆包和 Perplexity 等模型家族；实际可用性取决于 API 端点、账号权限和网关是否支持相应协议。

内置搜索需要服务器能够访问对应服务，匿名服务可能限流。插件将搜索结果交给对话模型使用，不会主动在回答末尾追加来源列表；模型自身仍可能根据回答内容引用链接。

内置搜索支持 Clash / Mihomo 的 Fake-IP 环境。任意网页抓取仍会拒绝非公网地址；如目标域名被解析为 Fake-IP，请将它加入代理的 `fake-ip-filter`，让 DNS 返回真实公网地址。

Yunzai 控制台会输出 `[chat-plugin][web]` 搜索和抓取日志，以及 `[chat-plugin][model]` 余额不足切换日志，便于定位接口、DNS 和网络问题。

## 数据与更新

运行配置保存在 `data/config/plugin.yml`，API 密钥保存在 `data/secrets/secrets.json`。更新前建议备份整个 `data/` 目录。

可使用宿主支持的更新命令：

```text
#更新yunzai-chat-plugin
#更新日志yunzai-chat-plugin
```

或在插件目录执行：

```bash
git pull
npm install --omit=dev
```

更新后重启 Yunzai。

## 源码开发

后端源码位于 `src/`，面板源码位于 `admin-ui/src/`。修改源码后重新生成并提交运行产物：

```bash
npm install
npm install --prefix admin-ui
npm run typecheck
npm run build
npm run check:release
```

`docs/`、`test/` 和 `tests/` 不进入 Git 仓库；本地已有测试可通过 `npm test` 运行。
