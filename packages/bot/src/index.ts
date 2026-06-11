import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import { config } from "./config.js";
import { botRoutes } from "./routes/bot-messages.js";
import { meetingPanelRoutes } from "./routes/meeting-panel.js";

async function main() {
  const fastify = Fastify({
    logger: { level: "info" },
  });

  await fastify.register(fastifyCors, { origin: true });
  await fastify.register(fastifyWebsocket);

  // Bot Framework messaging endpoint
  await fastify.register(botRoutes);

  // Meeting side panel WebSocket + REST
  await fastify.register(meetingPanelRoutes);

  // Health check
  fastify.get("/health", async () => ({
    status: "ok",
    service: "orka-bot",
    timestamp: new Date().toISOString(),
  }));

  try {
    await fastify.listen({ port: config.port, host: "0.0.0.0" });
    console.log(`\n  Nokia Orka Translator Bot`);
    console.log(`  Bot endpoint: http://localhost:${config.port}/api/messages`);
    console.log(`  Meeting panel: ws://localhost:${config.port}/ws/meeting`);
    console.log(`  Health: http://localhost:${config.port}/health`);
    console.log(`\n  Bot ID: ${config.botId || "(not configured)"}`);
    console.log(`  Tenant: ${config.azure.tenantId || "(not configured)"}\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
