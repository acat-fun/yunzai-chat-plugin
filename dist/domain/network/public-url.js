import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { WebError } from '../../contracts/web.js';
export function isPublicAddress(address) {
    try {
        // Node 的双栈 socket 可能返回 ::ffff:公网IPv4，先还原 IPv4 再做同样的内网校验。
        const parsed = ipaddr.process(address);
        // 隧道、保留、内网地址仍不接受，映射表示不能让内网绕过校验。
        return parsed.range() === 'unicast';
    }
    catch {
        return false;
    }
}
export function publicUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new WebError('WEB_INVALID_URL', '网页地址无效');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        (url.port && !['80', '443'].includes(url.port)) || host.includes('%') ||
        (isIP(host) && !isPublicAddress(host))) {
        throw new WebError('WEB_BLOCKED_URL', '只允许访问标准端口的公网 HTTP(S) 地址');
    }
    url.hash = '';
    return url;
}
//# sourceMappingURL=public-url.js.map