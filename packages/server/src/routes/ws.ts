import type { FastifyInstance } from "fastify";
import type { WebSocket as WsSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { ClientMessage, ServerMessage } from "@orka/shared";
import { isValidLanguage } from "@orka/shared";
import { OpenAIRealtimeService } from "../services/openai-realtime.service.js";
import { SessionManager } from "../services/session-manager.service.js";

const sessionManager = new SessionManager();

interface ListenerSession {
  id: string;
  realtime: OpenAIRealtimeService;
}

const sessions = new Map<string, ListenerSession>();

export async function wsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/ws/translate",
    { websocket: true },
    (socket: WsSocket) => {
      const clientId = randomUUID();
      fastify.log.info({ clientId }, "Client connected");

      socket.on("message", async (raw) => {
        try {
          const message: ClientMessage = JSON.parse(raw.toString());
          await handleClientMessage(clientId, socket, message, fastify);
        } catch {
          sendMessage(socket, {
            type: "error",
            code: "INVALID_MESSAGE",
            message: "Failed to parse message",
          });
        }
      });

      socket.on("close", async () => {
        fastify.log.info({ clientId }, "Client disconnected");
        await endSession(clientId);
      });

      socket.on("error", (err) => {
        fastify.log.error({ clientId, err }, "WebSocket error");
      });
    },
  );

  fastify.addHook("onClose", async () => {
    for (const [clientId] of sessions) {
      await endSession(clientId);
    }
    await sessionManager.shutdown();
  });
}

async function handleClientMessage(
  clientId: string,
  socket: WsSocket,
  message: ClientMessage,
  fastify: FastifyInstance,
): Promise<void> {
  switch (message.type) {
    case "start_listening": {
      console.log(`[ws] start_listening: target=${message.targetLanguage}`);

      if (!isValidLanguage(message.targetLanguage)) {
        sendMessage(socket, {
          type: "error",
          code: "INVALID_LANGUAGE",
          message: `Unsupported target language: ${message.targetLanguage}`,
        });
        return;
      }

      try {
        await endSession(clientId);

        const realtime = new OpenAIRealtimeService(message.targetLanguage);
        wireEvents(realtime, socket, fastify);
        await realtime.connect();

        const sessionId = randomUUID();
        sessions.set(clientId, { id: sessionId, realtime });

        sendMessage(socket, {
          type: "session_ready",
          sessionId,
          targetLanguage: message.targetLanguage,
        });
      } catch (err) {
        fastify.log.error({ clientId, err }, "Failed to start session");
        sendMessage(socket, {
          type: "error",
          code: "SESSION_START_FAILED",
          message: err instanceof Error ? err.message : "Failed to start",
        });
      }
      break;
    }

    case "stop_listening": {
      const sess = sessions.get(clientId);
      const sessionId = sess?.id ?? clientId;
      await endSession(clientId);
      sendMessage(socket, {
        type: "session_ended",
        sessionId,
        durationMs: 0,
      });
      break;
    }

    case "audio_chunk": {
      const sess = sessions.get(clientId);
      if (!sess) {
        sendMessage(socket, {
          type: "error",
          code: "NO_SESSION",
          message: "No active session. Send start_listening first.",
        });
        return;
      }
      sess.realtime.sendAudio(Buffer.from(message.data, "base64"));
      break;
    }
  }
}

function wireEvents(
  service: OpenAIRealtimeService,
  socket: WsSocket,
  fastify: FastifyInstance,
): void {
  service.on("transcript", (turnId: string, text: string, isFinal: boolean) => {
    sendMessage(socket, { type: "transcript", turnId, text, isFinal });
  });

  service.on("translated_text", (turnId: string, text: string, isFinal: boolean) => {
    sendMessage(socket, { type: "translated_text", turnId, text, isFinal });
  });

  service.on("translated_audio", (turnId: string, audioData: Buffer) => {
    sendMessage(socket, {
      type: "translated_audio",
      turnId,
      data: audioData.toString("base64"),
      format: "pcm",
    });
  });

  service.on("turn_skipped", (turnId: string, reason: "same_language") => {
    sendMessage(socket, {
      type: "turn_skipped",
      turnId,
      reason,
    });
  });

  service.on("error", (err: Error) => {
    fastify.log.error({ err: err.message }, "Translation error");
    sendMessage(socket, {
      type: "error",
      code: "TRANSLATION_ERROR",
      message: err.message,
    });
  });
}

async function endSession(clientId: string): Promise<void> {
  const sess = sessions.get(clientId);
  if (sess) {
    await sess.realtime.disconnect();
    sessions.delete(clientId);
  }
}

function sendMessage(socket: WsSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export { sessionManager };
