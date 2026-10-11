/** 旧 HTTP 实现曾把只读展示字段写入 YML；只清理已知展示字段，不吞掉未知配置。 */
export declare function migrateLegacyDisplayMetadata(input: unknown): unknown;
