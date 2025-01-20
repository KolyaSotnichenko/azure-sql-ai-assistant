import * as sql from "mssql";
import { AzureOpenAI, OpenAI } from "openai";

// Interfaces
export interface SQLQueryResult {
  [key: string]: any;
}

type Language = "english" | "ukrainian";

interface ColumnMetadata {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: string | null;
  COLUMN_DESCRIPTION: string | null;
}

interface TableMetadata {
  TABLE_NAME: string;
  TABLE_DESCRIPTION: string | null;
}

interface AIClientConfig {
  client: AzureOpenAI | OpenAI;
  model: string;
  language?: Language;
}

// Main classes
export class SQLSchemaInspector {
  private pool: sql.ConnectionPool | null = null;
  private config: sql.config;

  constructor(config: sql.config) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      if (!this.pool) {
        this.pool = await new sql.ConnectionPool(this.config).connect();
      }
    } catch (err) {
      throw new Error(
        `Failed to connect to database: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  async executeQuery<T = SQLQueryResult>(query: string): Promise<T[]> {
    if (!this.pool) {
      await this.connect();
    }
    const result = await this.pool!.request().query(query);
    return result.recordset;
  }

  async inspectSchema(): Promise<string> {
    try {
      await this.connect();

      if (!this.pool) {
        throw new Error("Failed to establish database connection");
      }

      // Get all tables
      const tables = await this.executeQuery<TableMetadata>(`
        SELECT 
          t.TABLE_NAME,
          CAST(p.value AS NVARCHAR(MAX)) as TABLE_DESCRIPTION
        FROM 
          INFORMATION_SCHEMA.TABLES t
          LEFT JOIN sys.extended_properties p ON 
            p.major_id = OBJECT_ID(t.TABLE_NAME) 
            AND p.minor_id = 0
            AND p.name = 'MS_Description'
        WHERE 
          t.TABLE_TYPE = 'BASE TABLE'
      `);

      let schema = "Database Schema:\n=================\n\n";

      // Process each table
      for (const table of tables) {
        const tableName = table.TABLE_NAME;

        // Get columns information
        const columns = await this.executeQuery<ColumnMetadata>(`
          SELECT 
            c.COLUMN_NAME,
            c.DATA_TYPE,
            c.IS_NULLABLE,
            c.COLUMN_DEFAULT,
            CAST(ep.value AS NVARCHAR(MAX)) as COLUMN_DESCRIPTION
          FROM 
            INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN sys.columns sc ON 
              sc.object_id = OBJECT_ID(c.TABLE_NAME)
              AND sc.name = c.COLUMN_NAME
            LEFT JOIN sys.extended_properties ep ON 
              ep.major_id = sc.object_id
              AND ep.minor_id = sc.column_id
              AND ep.name = 'MS_Description'
          WHERE 
            c.TABLE_NAME = '${tableName}'
          ORDER BY 
            c.ORDINAL_POSITION
        `);

        // Add table header with description if exists
        schema += `Table: ${tableName}\n`;
        if (table.TABLE_DESCRIPTION) {
          schema += `Description: ${table.TABLE_DESCRIPTION}\n`;
        }
        schema += "----------------------------------------\n";

        // Add columns information
        schema += "Columns:\n";
        for (const column of columns) {
          schema += `- ${column.COLUMN_NAME} (${column.DATA_TYPE})`;

          // Add additional column properties
          const properties: string[] = [];

          if (column.IS_NULLABLE === "NO") properties.push("NOT NULL");
          if (column.COLUMN_DEFAULT !== null)
            properties.push(`DEFAULT: ${column.COLUMN_DEFAULT}`);

          if (properties.length > 0) {
            schema += ` [${properties.join(", ")}]`;
          }

          // Add column description if exists
          if (column.COLUMN_DESCRIPTION) {
            schema += `\n  Description: ${column.COLUMN_DESCRIPTION}`;
          }

          schema += "\n";
        }

        // Get primary keys
        const primaryKeys = await this.executeQuery(`
          SELECT 
            COLUMN_NAME
          FROM 
            INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE 
            OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_NAME), 'IsPrimaryKey') = 1
            AND TABLE_NAME = '${tableName}'
        `);

        if (primaryKeys.length > 0) {
          schema += "\nPrimary Keys:\n";
          primaryKeys.forEach((pk: any) => {
            schema += `- ${pk.COLUMN_NAME}\n`;
          });
        }

        // Get foreign keys
        const foreignKeys = await this.executeQuery(`
          SELECT 
            fk.name as FK_NAME,
            OBJECT_NAME(fk.parent_object_id) as TABLE_NAME,
            c1.name as COLUMN_NAME,
            OBJECT_NAME(fk.referenced_object_id) as REFERENCED_TABLE_NAME,
            c2.name as REFERENCED_COLUMN_NAME
          FROM 
            sys.foreign_keys fk
            INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
            INNER JOIN sys.columns c1 ON fkc.parent_object_id = c1.object_id AND fkc.parent_column_id = c1.column_id
            INNER JOIN sys.columns c2 ON fkc.referenced_object_id = c2.object_id AND fkc.referenced_column_id = c2.column_id
          WHERE 
            OBJECT_NAME(fk.parent_object_id) = '${tableName}'
        `);

        if (foreignKeys.length > 0) {
          schema += "\nForeign Keys:\n";
          foreignKeys.forEach((fk: any) => {
            schema += `- ${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME})\n`;
          });
        }

        // Get indexes
        const indexes = await this.executeQuery(`
          SELECT 
            i.name as INDEX_NAME,
            COL_NAME(ic.object_id, ic.column_id) as COLUMN_NAME,
            i.is_unique
          FROM 
            sys.indexes i
            INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
          WHERE 
            i.object_id = OBJECT_ID('${tableName}')
            AND i.is_primary_key = 0
          ORDER BY 
            i.name, ic.key_ordinal
        `);

        if (indexes.length > 0) {
          schema += "\nIndexes:\n";
          const uniqueIndexes = new Map<
            string,
            { columns: string[]; isUnique: boolean }
          >();

          indexes.forEach((index: any) => {
            if (!uniqueIndexes.has(index.INDEX_NAME)) {
              uniqueIndexes.set(index.INDEX_NAME, {
                columns: [],
                isUnique: index.is_unique,
              });
            }
            uniqueIndexes
              .get(index.INDEX_NAME)!
              .columns.push(index.COLUMN_NAME);
          });

          uniqueIndexes.forEach((value, indexName) => {
            schema += `- ${indexName}${
              value.isUnique ? " (UNIQUE)" : ""
            }: ${value.columns.join(", ")}\n`;
          });
        }

        schema += "\n\n";
      }

      return schema;
    } catch (error) {
      throw new Error(
        `Failed to inspect database schema: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

export class SQLQueryAssistant {
  private aiConfig: AIClientConfig;

  constructor(config: AIClientConfig) {
    this.aiConfig = {
      ...config,
      language: config.language || "english",
    };
  }

  async generateSQLQuery(prompt: string, schema: string): Promise<string> {
    const response = await this.aiConfig.client.chat.completions.create({
      model: this.aiConfig.model,
      messages: [
        {
          role: "system",
          content: `You are a SQL expert. Given a database schema, generate a SQL query to answer the user's question.
                    Database Schema:
                    ${schema}
                    
                    Rules:
                    1. Return ONLY the SQL query, nothing else
                    2. Use proper SQL syntax
                    3. Make sure the query is safe and efficient`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
    });

    return this.cleanQuery(response.choices[0].message.content || "");
  }

  async formatResponse(
    query: string,
    results: SQLQueryResult[]
  ): Promise<string> {
    const response = await this.aiConfig.client.chat.completions.create({
      model: this.aiConfig.model,
      messages: [
        {
          role: "system",
          content: `Format the SQL query results into a natural language response in ${this.aiConfig.language}.`,
        },
        {
          role: "user",
          content: `SQL Query: ${query}\nResults: ${JSON.stringify(
            results
          )}\n\nPlease provide a natural language response:`,
        },
      ],
      temperature: 0,
    });

    return response.choices[0].message.content || "";
  }

  private cleanQuery(query: string): string {
    return query
      .replace(/```sql\n?/g, "")
      .replace(/```/g, "")
      .replace(/^\s+|\s+$/g, "");
  }
}

export class SQLAnalyzer {
  private inspector: SQLSchemaInspector;
  private assistant: SQLQueryAssistant;

  constructor(dbConfig: sql.config, aiConfig: AIClientConfig) {
    this.inspector = new SQLSchemaInspector(dbConfig);
    this.assistant = new SQLQueryAssistant(aiConfig);
  }

  async analyzeAndQuery(prompt: string): Promise<string> {
    try {
      // Отримуємо схему бази даних
      const schema = await this.inspector.inspectSchema();

      // Генеруємо SQL запит на основі промпту
      const query = await this.assistant.generateSQLQuery(prompt, schema);

      // Виконуємо згенерований запит
      const results = await this.inspector.executeQuery(query);

      console.log("SQL Results: ", results);

      // Форматуємо результати у природню мову
      return await this.assistant.formatResponse(query, results);
    } catch (error) {
      throw new Error(
        `Failed to analyze and query: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async disconnect(): Promise<void> {
    await this.inspector.disconnect();
  }
}
