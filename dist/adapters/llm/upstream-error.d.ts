/** 只提取供应商的错误分类和参数名，不回显可能包含凭据或请求正文的 message。 */
export declare function upstreamErrorDetail(response: Response): Promise<string>;
