import type { IncomingMessage } from '../../../contracts/types.js';
/** 被动聊天不抢占 Yunzai 和其他插件的命令。 */
export declare function acceptsPassiveChat(message: IncomingMessage): boolean;
