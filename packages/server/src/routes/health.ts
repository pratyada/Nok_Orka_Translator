import type { FastifyInstance } from "fastify";
import { sessionManager } from "./ws.js";

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      activeSessions: sessionManager.activeCount,
    };
  });
}
