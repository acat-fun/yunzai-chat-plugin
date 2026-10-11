import { ToolRegistry } from './tool-registry.js';
import type { WebPort } from '../ports/web.js';
import { type WebConfig } from '../../contracts/web.js';
export declare const webTools: ({
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            queries: {
                type: string;
                items: {
                    type: string;
                };
                minItems: number;
                maxItems: number;
            };
            url?: undefined;
        };
        required: string[];
        additionalProperties: boolean;
    };
} | {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            url: {
                type: string;
            };
            queries?: undefined;
        };
        required: string[];
        additionalProperties: boolean;
    };
})[];
export declare function createWebTools(web: WebPort, config: WebConfig): ToolRegistry;
