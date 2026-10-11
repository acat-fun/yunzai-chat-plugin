import { getRuntime } from './dist/bootstrap/runtime.js';
import { assertGuobaWebAccess } from './dist/application/admin/web-config.js';

const runtime = getRuntime();
await runtime.ensureLoaded();
const models = config => config.providers.flatMap(provider => provider.models.map(model => ({ provider, model })));

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'chat-plugin', title: 'Chat Plugin', author: '@chat-plugin',
      authorLink: '', link: '', isV3: true, isV2: false,
      description: '自动聊天插件；模型联网开关与自带面板共用 YML',
      icon: 'mdi:robot-happy-outline', iconColor: '#23252b',
    },
    configInfo: {
      get schemas() {
        const notice = { field: 'notice', label: '模型联网', component: 'Divider', bottomHelpMessage: '在模型上开启联网即可，复用该模型的 API 与密钥；接口需支持工具调用和原生搜索。锅巴授权可在自带面板关闭。' };
        const config = runtime.configStore.get();
        try { assertGuobaWebAccess(config); } catch { return [notice]; }
        return [notice,
          { field: 'expectedRevision', label: '配置版本', component: 'Input', componentProps: { disabled: true } },
          ...models(config).map(({ provider, model }, index) => ({ field: `modelNetwork${index}`, label: `${provider.displayName} / ${model.displayName} 联网`, component: 'Switch' })),
        ];
      },
      async getConfigData() {
        const config = runtime.configStore.get();
        assertGuobaWebAccess(config);
        return Object.fromEntries([['expectedRevision', config.revision], ...models(config).map(({ model }, index) => [`modelNetwork${index}`, Boolean(model.toolCalling)])]);
      },
      async setConfigData(data, { Result }) {
        try {
          const config = runtime.configStore.get();
          assertGuobaWebAccess(config);
          if (typeof data.expectedRevision !== 'string' || data.expectedRevision !== config.revision) throw new Error('配置已更新，请刷新后再保存');
          for (const [index, { model }] of models(config).entries()) {
            const enabled = data[`modelNetwork${index}`];
            if (typeof enabled !== 'boolean') throw new Error('模型联网开关必须为布尔值');
            model.toolCalling = enabled;
          }
          await runtime.configStore.save(config, data.expectedRevision);
          return Result.ok({}, '模型联网开关已保存，请刷新配置。');
        } catch (error) {
          return Result.error(error instanceof Error ? error.message : '模型联网设置保存失败');
        }
      },
    },
  };
}
