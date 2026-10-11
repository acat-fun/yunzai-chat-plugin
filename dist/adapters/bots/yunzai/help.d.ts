type RenderOptions = {
    retType: string;
    beforeRender(context: {
        data: Record<string, unknown>;
    }): Record<string, unknown>;
};
type HelpEvent = {
    runtime?: {
        render(plugin: string, template: string, data: unknown, options: RenderOptions): Promise<unknown>;
    };
    reply(message: unknown): Promise<unknown>;
};
export declare function sendYunzaiHelp(event: HelpEvent): Promise<unknown>;
export {};
