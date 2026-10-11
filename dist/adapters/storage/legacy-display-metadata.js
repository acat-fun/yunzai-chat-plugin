/** 旧 HTTP 实现曾把只读展示字段写入 YML；只清理已知展示字段，不吞掉未知配置。 */
export function migrateLegacyDisplayMetadata(input) {
    const copy = structuredClone(input);
    if (!copy || typeof copy !== 'object')
        return copy;
    const config = copy;
    if (config.schemaVersion !== 1 || !Array.isArray(config.providers))
        return copy;
    for (const provider of config.providers) {
        if (!provider || typeof provider !== 'object')
            continue;
        const auth = provider.auth;
        if (!auth || typeof auth !== 'object' || Array.isArray(auth))
            continue;
        const metadata = auth;
        if (typeof metadata.configured === 'boolean')
            delete metadata.configured;
        if (typeof metadata.maskedHint === 'string' && metadata.maskedHint.length > 64) {
            metadata.maskedHint = `${metadata.maskedHint.slice(0, 5)}**********${metadata.maskedHint.slice(-5)}`;
        }
    }
    return copy;
}
//# sourceMappingURL=legacy-display-metadata.js.map