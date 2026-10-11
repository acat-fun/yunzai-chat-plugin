/** 普通 Markdown 转全文文字；仅表格、思维导图和公式触发宿主截图。 */
export declare function formatYunzaiReply(text: string): {
    text: string;
    html: string | null;
    hasMath: boolean;
};
type ReplyEvent = {
    runtime?: {
        render(plugin: string, template: string, data: Record<string, unknown>, options: {
            retType: string;
            beforeRender(context: {
                data: Record<string, unknown>;
            }): Record<string, unknown>;
        }): Promise<unknown>;
    };
    reply(message: unknown): Promise<unknown>;
};
export declare function sendYunzaiReply(event: ReplyEvent, reply: string): Promise<unknown>;
export {};
