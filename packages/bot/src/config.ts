import "dotenv/config";

export const config = {
  // Bot Framework
  botId: process.env.BOT_ID ?? "",
  botPassword: process.env.BOT_PASSWORD ?? "",

  // Azure Entra ID (for Graph API)
  azure: {
    tenantId: process.env.AZURE_TENANT_ID ?? "",
    clientId: process.env.AZURE_CLIENT_ID ?? "",
    clientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
  },

  // Server
  port: parseInt(process.env.BOT_PORT ?? "3978", 10),
} as const;
