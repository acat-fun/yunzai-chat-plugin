export type HelpGroup = {
    title: string;
    items: Array<{
        command: string;
        description: string;
    }>;
};
export declare function getHelpContent(installName?: string): {
    title: string;
    subtitle: string;
    groups: HelpGroup[];
};
export declare function getHelpText(installName?: string): string;
