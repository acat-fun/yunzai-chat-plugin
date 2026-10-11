import type { PluginConfig } from '../../contracts/types.js';
/** 固定目标与可编辑字段表；拒绝动态方法名、数组下标和原型路径。 */
export declare function setConfigValue(config: PluginConfig, args: string): PluginConfig;
