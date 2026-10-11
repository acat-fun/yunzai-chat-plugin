import type { PluginConfig } from '../../contracts/types.js';
import { validateConfig } from '../../contracts/config-schema.js';

const aliases: Record<string, string> = {
  默认模型: 'route', 后备模型: 'fallbackRoutes', 默认提示词: 'prompt', 正则触发: 'regex', 私聊始终回复: 'alwaysPrivate',
  思考强度: 'reasoning', 回复图片: 'replyImages', 回复文件: 'replyFiles',
  上下文条数: 'contextCount', 历史时限: 'contextAgeMinutes', 群随机回复: 'groupRandom', 回复概率: 'replyProbability',
  启用: 'enabled', 显示名称: 'displayName', API地址: 'baseUrl', API协议: 'protocol',
  上下文窗口: 'contextWindowTokens', 最大输出: 'maxOutputTokens', 输入类型: 'inputTypes',
  名称: 'name', 内容: 'content', 白名单: 'chatWhitelist', 黑名单: 'chatBlacklist',
  监听地址: 'host', 端口: 'port', 联网: 'toolCalling', 工具调用: 'toolCalling', 搜索后端: 'searchProviderId', 后端列表: 'providers',
  推理: 'reasoningEnabled', 推理模式: 'reasoningMode',
};

/** 固定目标与可编辑字段表；拒绝动态方法名、数组下标和原型路径。 */
export function setConfigValue(config: PluginConfig, args: string): PluginConfig {
  let remaining = args;
  const token = () => {
    const match = /^\s*(\S+)/.exec(remaining);
    if (!match) return '';
    remaining = remaining.slice(match[0].length);
    return match[1]!;
  };
  const target = token();
  let object: object | undefined;
  let fields: string[];
  switch (target) {
    case '默认': object = config.defaults; fields = Object.keys(config.defaults); break;
    case '联网': object = config.web; fields = ['engineOrder', 'enabled', 'searchProviderId', 'providers', 'searchTimeoutSeconds', 'fetchTimeoutSeconds', 'maxFetchChars', 'maxToolCalls', 'maxToolRounds', 'agentTimeoutSeconds']; break;
    case '插件': object = config.plugin; fields = ['enabled']; break;
    case '权限': object = config.access; fields = ['chatWhitelist', 'chatBlacklist']; break;
    case '面板': object = config.admin.standalone; fields = ['enabled', 'host', 'port']; break;
    case '运行': object = config.runtime; fields = ['queue.maxPendingPerSession', 'queue.maxConcurrentGlobal', 'limits.perUserRequestsPerMinute', 'limits.globalRequestsPerMinute', 'llm.requestTimeoutSeconds', 'llm.maxAttempts', 'context.cacheTtlSeconds']; break;
    case '提供商': {
      const id = token(); object = config.providers.find(p => p.id === id);
      fields = ['displayName', 'enabled', 'baseUrl', 'protocol']; break;
    }
    case '模型': {
      const id = token();
      const p = config.providers.find(p => p.id === id);
      const modelId = token();
      object = p?.models.find(m => m.id === modelId);
      fields = ['displayName', 'contextWindowTokens', 'maxOutputTokens', 'inputTypes', 'reasoningEnabled', 'reasoningMode', 'toolCalling'];
      break;
    }
    case '提示词': {
      const id = token(); object = config.prompts.find(p => p.id === id);
      fields = ['name', 'enabled', 'content']; break;
    }
    case '策略': {
      const id = token(); object = config.policies.find(p => p.id === id)?.overrides;
      fields = Object.keys(config.defaults); break;
    }
    default: throw new Error('支持目标：默认、联网、插件、权限、面板、运行、提供商 ID、模型 提供商ID 模型ID、提示词 ID、策略 ID');
  }
  if (!object) throw new Error('配置目标不存在');
  const fieldToken = token();
  const field = fieldToken === '联网' && ['默认', '策略'].includes(target) ? 'webEnabled' : aliases[fieldToken] ?? fieldToken;
  if (!fields.includes(field)) throw new Error('字段不可编辑或不存在');
  const raw = remaining.trim();
  if (!raw) throw new Error('缺少字段值；字符串含空格时请使用 JSON 双引号');
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch {
    if (/\s|^[\[\{"']/.test(raw)) throw new Error('字段值必须是有效 JSON');
    value = raw;
  }
  if (target === '联网' && field === 'providers') {
    if (!Array.isArray(value)) throw new Error('搜索后端列表必须是数组');
    value = value.map(item => {
      if (!item || typeof item !== 'object') throw new Error('搜索后端结构无效');
      const p = item as Record<string, unknown>;
      if ('auth' in p) throw new Error('密钥请通过 #chat设置搜索密钥 配置，不接受 auth 字段');
      const old = config.web.providers.find(old => old.id === p.id);
      if (old?.auth.secretRef && (old.type !== p.type || old.baseUrl !== p.baseUrl)) throw new Error('更换搜索服务或地址前，请先清除搜索密钥');
      return { ...p, auth: old?.auth ?? { secretRef: '', maskedHint: '' } };
    });
  }
  const segments = field.split('.');
  let destination = object as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) destination = destination[segment] as Record<string, unknown>;
  destination[segments.at(-1)!] = value;
  return validateConfig(config);
}
