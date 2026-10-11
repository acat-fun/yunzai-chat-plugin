/** 密钥脱敏：最长前后各 5 位；过短则减少可见位数；再短则只显示 *。 */
export declare function maskHint(secret: string): string;
