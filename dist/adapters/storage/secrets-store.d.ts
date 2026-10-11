export declare function getSecret(ref: string): Promise<string | undefined>;
export declare function replaceSecret(id: string, value: string): Promise<{
    ref: string;
    maskedHint: string;
}>;
export declare function clearSecret(id: string): Promise<void>;
export declare function secretFilePath(): string;
