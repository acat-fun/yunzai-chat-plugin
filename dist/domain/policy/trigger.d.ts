import type { EffectiveSettings, IncomingMessage } from '../../contracts/types.js';
export type TriggerResult = {
    hit: true;
    reason: string;
} | {
    hit: false;
    reason: string;
};
export declare function evaluateTrigger(msg: IncomingMessage, settings: EffectiveSettings, randomValue: number): TriggerResult;
