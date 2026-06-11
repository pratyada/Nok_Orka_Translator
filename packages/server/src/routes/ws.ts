import type { FastifyInstance } from "fastify";
import type { WebSocket as WsSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { ClientMessage, ServerMessage, StreamDirection } from "@orka/shared";
import { isValidLanguage } from "@orka/shared";
import { OpenAIRealtimeService } from "../services/openai-realtime.service.js";
import { SessionManager } from "../services/session-manager.service.js";

const sessionManager = new SessionManager();

interface ConversationSession {
  id: string;
  outgoing: OpenAIRealtimeService; // my mic → their language
  incoming: OpenAIRealtimeService; // their voice → my language
}

const conversations = new Map<string, ConversationSession>();

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
        } catch (err) {
          sendMessage(socket, {
            type: "error",
            code: "INVALID_MESSAGE",
            message: "Failed to parse message",
          });
        }
      });

      socket.on("close", async () => {
        fastify.log.info({ clientId }, "Client disconnected");
        await endConversation(clientId);
      });

      socket.on("error", (err) => {
        fastify.log.error({ clientId, err }, "WebSocket error");
      });
    },
  );

  fastify.addHook("onClose", async () => {
    for (const [clientId] of conversations) {
      await endConversation(clientId);
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
    case "start_conversation": {
      console.log(`[ws] start_conversation: ${message.myLanguage} ↔ ${message.theirLanguage}`);

      if (!isValidLanguage(message.myLanguage) || !isValidLanguage(message.theirLanguage)) {
        sendMessage(socket, {
          type: "error",
          code: "INVALID_LANGUAGE",
          message: `Unsupported language pair`,
        });
        return;
      }

      try {
        // End any existing conversation
        await endConversation(clientId);

        // Create two OpenAI Realtime sessions:
        // 1. Outgoing: my mic (myLanguage) → translate to theirLanguage
        const outgoing = new OpenAIRealtimeService(message.myLanguage, message.theirLanguage);

        // 2. Incoming: their voice (theirLanguage) → translate to myLanguage
        const incoming = new OpenAIRealtimeService(message.theirLanguage, message.myLanguage);

        // Wire outgoing events (what I say → translated for them)
        wireStream(outgoing, socket, "outgoing", fastify);

        // Wire incoming events (what they say → translated for me)
        wireStream(incoming, socket, "incoming", fastify);

        // Connect outgoing first
        await outgoing.connect();
        console.log(`[ws] Outgoing stream ready: ${message.myLanguage} → ${message.theirLanguage}`);

        // Connect incoming
        await incoming.connect();
        console.log(`[ws] Incoming stream ready: ${message.theirLanguage} → ${message.myLanguage}`);

        conversations.set(clientId, {
          id: randomUUID(),
          outgoing,
          incoming,
        });

        sendMessage(socket, {
          type: "conversation_ready",
          sessionId: conversations.get(clientId)!.id,
          myLanguage: message.myLanguage,
          theirLanguage: message.theirLanguage,
        });
      } catch (err) {
        fastify.log.error({ clientId, err }, "Failed to start conversation");
        sendMessage(socket, {
          type: "error",
          code: "SESSION_START_FAILED",
          message: err instanceof Error ? err.message : "Failed to start",
        });
      }
      break;
    }

    case "stop_translation": {
      await endConversation(clientId);
      sendMessage(socket, {
        type: "session_ended",
        sessionId: clientId,
        durationMs: 0,
      });
      break;
    }

    case "audio_chunk": {
      const conv = conversations.get(clientId);
      if (!conv) {
        sendMessage(socket, {
          type: "error",
          code: "NO_SESSION",
          message: "No active conversation. Send start_conversation first.",
        });
        return;
      }

      const audioBuffer = Buffer.from(message.data, "base64");
      const stream = message.stream;

      // Route audio to the correct OpenAI session
      if (stream === "outgoing") {
        conv.outgoing.sendAudio(audioBuffer);
      } else if (stream === "incoming") {
        conv.incoming.sendAudio(audioBuffer);
      }
      break;
    }
  }
}

function wireStream(
  service: OpenAIRealtimeService,
  socket: WsSocket,
  stream: StreamDirection,
  fastify: FastifyInstance,
): void {
  service.on("original_transcript", (text, isFinal) => {
    sendMessage(socket, { type: "transcript", stream, text, isFinal });
  });

  service.on("translated_text", (text, isFinal) => {
    sendMessage(socket, { type: "translated_text", stream, text, isFinal });
  });

  service.on("translated_audio", (audioData) => {
    sendMessage(socket, {
      type: "translated_audio",
      stream,
      data: audioData.toString("base64"),
      format: "pcm",
    });
  });

  service.on("error", (err) => {
    fastify.log.error({ stream, err: err.message }, "Translation error");
    sendMessage(socket, {
      type: "error",
      code: "TRANSLATION_ERROR",
      message: err.message,
    });
  });
}

async function endConversation(clientId: string): Promise<void> {
  const conv = conversations.get(clientId);
  if (conv) {
    await conv.outgoing.disconnect();
    await conv.incoming.disconnect();
    conversations.delete(clientId);
  }
}

function sendMessage(socket: WsSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export { sessionManager };
