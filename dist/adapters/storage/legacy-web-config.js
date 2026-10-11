/** 升级时移除已退役的联网字段；保留新版设置和用户明确关闭的锅巴授权。 */
export function removeLegacyWebConfig(input) {
    const copy = structuredClone(input);
    if (!copy || typeof copy !== 'object')
        return copy;
    const config = copy;
    if (config.schemaVersion !== 1)
        return copy;
    if (config.runtime && typeof config.runtime === 'object' && !Array.isArray(config.runtime)) {
        delete config.runtime.search;
    }
    if (Array.isArray(config.providers)) {
        for (const provider of config.providers) {
            if (!provider || typeof provider !== 'object' || !Array.isArray(provider.models))
                continue;
            for (const model of provider.models) {
                if (model && typeof model === 'object' && !Array.isArray(model))
                    delete model.webSearch;
            }
        }
    }
    return copy;
}
//# sourceMappingURL=legacy-web-config.js.map