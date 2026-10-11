import type { PluginConfig } from './types.js';
export declare class ConfigValidationError extends Error {
    readonly code = "VALIDATION_ERROR";
}
/** 当前 v0.1 平面配置契约；完整嵌套设计的迁移仍需单独完成。 */
export declare function validateConfig(input: unknown): PluginConfig;
