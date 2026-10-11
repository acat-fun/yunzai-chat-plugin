import type { ChatRuntime } from '../../../bootstrap/runtime.js';
import { discoverUpstreamModels } from './discover-models.js';
import type { SecretRepository } from '../../../application/ports/index.js';
export declare class AdminHttpServer {
    private readonly runtime;
    private readonly secrets;
    private readonly discoverModels;
    private server;
    private readonly sessions;
    private readonly credentials;
    private readonly issuedAt;
    issueLoginCode(channel: 'qq' | 'console'): string;
    private consumeLoginCode;
    constructor(runtime: ChatRuntime, secrets?: SecretRepository, discoverModels?: typeof discoverUpstreamModels);
    start(): Promise<{
        url: string;
    } | null>;
    stop(): Promise<void>;
    private handle;
    private handleApi;
}
