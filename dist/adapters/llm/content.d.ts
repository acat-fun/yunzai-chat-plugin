import type { ChatContent } from '../../application/ports/index.js';
export declare function textContent(content: ChatContent): string;
export declare function encodeContent(content: ChatContent, protocol: 'chat' | 'responses' | 'anthropic', assistant?: boolean): unknown;
