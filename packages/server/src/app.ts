import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { config } from "./config/index.js";
import { wsRoutes } from "./routes/ws.js";
import { healthRoutes } from "./routes/health.js";

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === "development" ? "debug" : "info",
    },
  });

  // Plugins
  await fastify.register(fastifyCors, {
    origin: config.nodeEnv === "development" ? true : false,
  });
  await fastify.register(fastifyWebsocket);

  // Routes
  await fastify.register(healthRoutes);
  await fastify.register(wsRoutes);

  // In production, serve the built React frontend
  if (config.nodeEnv === "production") {
    // Look for webapp in several locations
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const possiblePaths = [
      path.join(__dirname, "..", "webapp"),          // packages/server/webapp
      path.join(__dirname, "..", "..", "app", "dist"), // packages/app/dist
      path.join(process.cwd(), "webapp"),             // cwd/webapp
    ];

    const webappDir = possiblePaths.find((p) => fs.existsSync(p));

    if (webappDir) {
      console.log(`[server] Serving frontend from: ${webappDir}`);
      await fastify.register(fastifyStatic, {
        root: webappDir,
        prefix: "/",
      });

      // SPA fallback — serve index.html for any non-API route
      fastify.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith("/ws/") || request.url.startsWith("/api/")) {
          return reply.code(404).send({ error: "Not found" });
        }
        return reply.sendFile("index.html");
      });
    } else {
      console.warn("[server] No webapp directory found — API-only mode");
    }
  }

  return fastify;
}
