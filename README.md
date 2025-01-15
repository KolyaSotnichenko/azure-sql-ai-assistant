# Azure SQL AI Assistant

AI-powered асистент для роботи з Azure SQL Database, який поєднує аналіз схеми бази даних, генерацію SQL-запитів на основі природної мови та інтелектуальне форматування результатів.

## Основні можливості

- 🤖 **AI-Powered Queries**: Генерація SQL запитів з природномовних запитань
- 🌍 **Багатомовність**: Підтримка різних мов для запитів та відповідей
- 📊 **Аналіз схеми**: Детальний аналіз структури бази даних
- 🎯 **Розумне форматування**: Представлення результатів у зручному для читання форматі
- 🔒 **Безпека**: Безпечне управління підключеннями та запитами

## Встановлення

```bash
npm install azure-sql-ai-assistant openai
```

## Компоненти

### SQLSchemaInspector

Аналізує та надає детальну інформацію про структуру бази даних.

### SQLQueryAssistant

Використовує AI для перетворення природномовних запитів у SQL та форматування результатів.

### SQLAnalyzer

Об'єднує можливості обох компонентів для повного циклу роботи з базою даних.

## Приклади використання

### Базовий аналіз схеми

```typescript
import { SQLSchemaInspector } from "azure-sql-ai-assistant";

const inspector = new SQLSchemaInspector({
  server: "your-server.database.windows.net",
  port: 1433,
  user: "your-username",
  password: "your-password",
  database: "your-database",
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
});

const schema = await inspector.inspectSchema();
```

### AI-асистент для запитів

```typescript
import { SQLQueryAssistant } from "azure-sql-ai-assistant";
import { OpenAI } from "openai";

const assistant = new SQLQueryAssistant({
  client: new OpenAI({ apiKey: "your-api-key" }),
  model: "gpt-4",
  language: "ukrainian", // підтримка різних мов
});

// Генерація SQL запиту з природномовного запитання
const query = await assistant.generateSQLQuery(
  "Знайти всіх користувачів з України, які зареєструвалися цього місяця",
  schemaString
);

// Форматування результатів природною мовою
const response = await assistant.formatResponse(query, results);
```

### Повний цикл роботи

```typescript
import { SQLAnalyzer } from "azure-sql-ai-assistant";
import { OpenAI } from "openai";

const analyzer = new SQLAnalyzer(
  // Конфігурація бази даних
  {
    server: "your-server.database.windows.net",
    port: 1433,
    user: "your-username",
    password: "your-password",
    database: "your-database",
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  },
  // Конфігурація AI
  {
    client: new OpenAI({ apiKey: "your-api-key" }),
    model: "gpt-4",
    language: "ukrainian",
  }
);

async function main() {
  try {
    // Один метод для всього процесу:
    // 1. Аналіз схеми
    // 2. Генерація SQL запиту
    // 3. Виконання запиту
    // 4. Форматування результатів
    const result = await analyzer.analyzeAndQuery(
      "Покажи топ-5 найактивніших користувачів за останній місяць"
    );
    console.log(result);
  } finally {
    await analyzer.disconnect();
  }
}
```

## Детальна інформація про базу даних

- Повний аналіз схеми:
  - Таблиці та їх опис
  - Колонки та їх типи даних
  - Первинні та зовнішні ключі
  - Індекси та обмеження

## Вимоги

- Node.js 14 або вище
- Azure SQL Database
- OpenAI API ключ

## Ліцензія

MIT
