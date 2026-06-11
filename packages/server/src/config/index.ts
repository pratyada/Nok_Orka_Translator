import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  },

  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY ?? "",
  },

  redis: {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  },

  database: {
    url: process.env.DATABASE_URL ?? "",
  },

  azure: {
    clientId: process.env.AZURE_CLIENT_ID ?? "",
    clientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
    tenantId: process.env.AZURE_TENANT_ID ?? "",
  },
} as const;

export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.openai.apiKey) errors.push("OPENAI_API_KEY is required");
  return errors;
}
