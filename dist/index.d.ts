import * as sql from "mssql";
import { AzureOpenAI, OpenAI } from "openai";
export interface SQLQueryResult {
    [key: string]: any;
}
interface AIClientConfig {
    client: AzureOpenAI | OpenAI;
    model: string;
    language?: string;
}
export declare class SQLSchemaInspector {
    private pool;
    private config;
    constructor(config: sql.config);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    executeQuery<T = SQLQueryResult>(query: string): Promise<T[]>;
    inspectSchema(): Promise<string>;
}
export declare class SQLQueryAssistant {
    private aiConfig;
    constructor(config: AIClientConfig);
    generateSQLQuery(prompt: string, schema: string): Promise<string>;
    formatResponse(query: string, results: SQLQueryResult[]): Promise<string>;
    private cleanQuery;
}
export declare class SQLAnalyzer {
    private inspector;
    private assistant;
    constructor(dbConfig: sql.config, aiConfig: AIClientConfig);
    analyzeAndQuery(prompt: string): Promise<string>;
    disconnect(): Promise<void>;
}
export {};
