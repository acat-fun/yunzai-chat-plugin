import type { IncomingMessage } from '../../../contracts/types.js';
export type YunzaiEvent = {
    self_id?: unknown;
    user_id?: unknown;
    group_id?: unknown;
    bot?: {
        uin?: unknown;
    };
    isGroup?: boolean;
    message_type?: string;
    msg?: unknown;
    raw_message?: unknown;
    message?: unknown[];
    atBot?: boolean;
    atme?: boolean;
    message_id?: unknown;
    seq?: unknown;
    time?: number | string;
    isSelf?: boolean;
    isMaster?: boolean;
    img?: unknown[];
    source?: unknown;
    getReply?: () => Promise<unknown>;
};
/** 只从消息文本段取正文，@ 展示名和 CQ 标签不进入模型。 */
export declare function normalizeYunzaiEvent(e: YunzaiEvent): IncomingMessage;
/** 引用内容属于正文附件，绝不能替换命令或触发规则使用的 rawText。 */
export declare function enrichYunzaiReply(e: YunzaiEvent, msg: IncomingMessage): Promise<IncomingMessage>;
