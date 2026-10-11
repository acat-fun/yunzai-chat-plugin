/** 密钥脱敏：最长前后各 5 位；过短则减少可见位数；再短则只显示 *。 */
export function maskHint(secret) {
    const text = String(secret ?? '');
    const length = text.length;
    if (!length)
        return '';
    const edge = Math.min(5, Math.floor((length - 4) / 2));
    if (edge < 1)
        return '*'.repeat(Math.max(4, length));
    const stars = Math.max(4, length - 2 * edge);
    return `${text.slice(0, edge)}${'*'.repeat(stars)}${text.slice(length - edge)}`;
}
//# sourceMappingURL=mask.js.map