/** 图片只从 QQ 固定 CDN 下载，不读取事件中的本机路径、任意主机或重定向。 */
export declare function resolveYunzaiImage(value: string, send?: typeof fetch, signal?: AbortSignal): Promise<string>;
