import type { ConfigRepository, ContextRepository, SecretRepository, LlmPort } from '../ports/index.js';
import type { IncomingMessage } from '../../contracts/types.js';
export type ChatHandleResult = {
    action: 'ignore';
    reason: string;
} | {
    action: 'reply';
    text: string;
    reason: string;
    commit?: () => void;
} | {
    action: 'error';
    text: string;
    reason: string;
};
export declare function handleChatMessage(options: {
    configStore: ConfigRepository;
    contextStore: ContextRepository;
    secrets: SecretRepository;
    llm: LlmPort;
    msg: IncomingMessage;
    force?: boolean;
    signal?: AbortSignal;
    deferHistory?: boolean;
    randomValue?: number;
    onModelFallback?(from: string, to: string): void;
    imageResolver?: {
        resolve(url: string, signal?: AbortSignal): Promise<string>;
    };
}): Promise<ChatHandleResult>;
