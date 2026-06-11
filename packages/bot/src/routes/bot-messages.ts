import type { FastifyInstance } from "fastify";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";
import { OrkaBot } from "../bot/orka-bot.js";
import { config } from "../config.js";

const botAuth = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: config.botId,
  MicrosoftAppPassword: config.botPassword,
  MicrosoftAppTenantId: config.azure.tenantId,
  MicrosoftAppType: "SingleTenant",
});

const adapter = new CloudAdapter(botAuth);
const bot = new OrkaBot();

// Error handler
adapter.onTurnError = async (context, error) => {
  console.error(`[bot] Unhandled error: ${error.message}`);
  await context.sendActivity("Sorry, something went wrong with the translation.");
};

export async function botRoutes(fastify: FastifyInstance): Promise<void> {
  // Bot Framework messaging endpoint
  fastify.post("/api/messages", async (request, reply) => {
    try {
      await adapter.process(request.raw, reply.raw as any, async (context) => {
        await bot.run(context);
      });
    } catch (err) {
      console.error("[bot] Process error:", err);
      if (!reply.sent) {
        return reply.code(500).send({ error: "Bot processing failed" });
      }
    }
  });

  // Graph webhook for transcript notifications
  fastify.post("/api/transcripts/notify", async (request, reply) => {
    const body = request.body as any;

    // Validation token for subscription setup
    if (body?.validationToken) {
      return reply.type("text/plain").send(body.validationToken);
    }

    // Process transcript notifications
    if (body?.value) {
      for (const notification of body.value) {
        if (notification.clientState === "orka-translator") {
          console.log("[bot] Transcript notification:", notification.resource);
          // TODO: Fetch transcript content and process through translation pipeline
        }
      }
    }

    return reply.code(202).send();
  });

  // Teams call event webhook
  fastify.post("/api/calls", async (request, reply) => {
    const body = request.body as any;
    console.log("[bot] Call event:", JSON.stringify(body).slice(0, 200));
    return reply.code(200).send();
  });
}

export { bot, adapter };
