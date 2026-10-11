import type { ConfigRepository, SecretRepository } from '../ports/index.js';
import type { IncomingMessage } from '../../contracts/types.js';
export type CommandResult = {
    handled: true;
    reply: string;
} | {
    handled: false;
};
export declare function tryHandleCommand(options: {
    configStore: ConfigRepository;
    secrets: SecretRepository;
    msg: IncomingMessage;
}): Promise<CommandResult>;
