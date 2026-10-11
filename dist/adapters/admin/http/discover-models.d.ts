/**
 * 按供应商草稿调用上游 /models，结果只进入面板草稿，不写配置。
 */
import type { ProtocolId } from '../../../contracts/types.js';
export type DiscoveredModel = {
    id: string;
    displayName: string;
};
export declare function discoverUpstreamModels(input: {
    baseUrl: string;
    protocol: ProtocolId;
    apiKey?: string;
}): Promise<{
    models: DiscoveredModel[];
    truncated: boolean;
}>;
