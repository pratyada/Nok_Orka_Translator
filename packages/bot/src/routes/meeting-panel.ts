import type { FastifyInstance } from "fastify";
import type { WebSocket as WsSocket } from "ws";
import { randomUUID } from "node:crypto";
import { isValidLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from "@orka/shared";
import {
  getOrCreateSession,
  getSession,
  type MeetingParticipant,
} from "../services/meeting-session.js";
import { translateAndSpeak } from "../services/translation.service.js";

/**
 * WebSocket endpoint for the Teams meeting side panel.
 * Participants connect here to receive real-time translations.
 *
 * Protocol:
 * Client -> Server:
 *   { type: "join", meetingId, userId, userName, targetLanguage }
 *   { type: "transcript", speaker, text }  (for demo/testing without Graph)
 *
 * Server -> Client:
 *   { type: "joined", meetingId, sourceLanguage }
 *   { type: "translation", speaker, originalText, translatedText, audioBase64? }
 *   { type: "error", message }
 */
export async function meetingPanelRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get("/ws/meeting", { websocket: true }, (socket: WsSocket) => {
    const clientId = randomUUID();
    let meetingId: string | null = null;
    let userId: string | null = null;

    console.log(`[panel] Client connected: ${clientId}`);

    socket.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case "join": {
            if (!msg.meetingId || !msg.targetLanguage) {
              send(socket, {
                type: "error",
                message: "meetingId and targetLanguage required",
              });
              return;
            }

            if (!isValidLanguage(msg.targetLanguage)) {
              send(socket, {
                type: "error",
                message: `Unsupported language: ${msg.targetLanguage}`,
              });
              return;
            }

            meetingId = msg.meetingId as string;
            userId = (msg.userId ?? clientId) as string;

            const session = getOrCreateSession(meetingId);
            session.addParticipant({
              userId,
              name: msg.userName ?? "Participant",
              targetLanguage: msg.targetLanguage as LanguageCode,
            });

            // Listen for translations for this participant
            session.on("translation", (result, participant) => {
              if (participant.userId === userId) {
                send(socket, {
                  type: "translation",
                  speaker: result.speaker,
                  originalText: result.originalText,
                  translatedText: result.translatedText,
                  audioBase64: result.audioBuffer
                    ? result.audioBuffer.toString("base64")
                    : undefined,
                  timestamp: result.timestamp,
                });
              }
            });

            session.start();

            send(socket, {
              type: "joined",
              meetingId,
              sourceLanguage: session.sourceLanguage,
            });

            console.log(
              `[panel] ${msg.userName ?? clientId} joined meeting ${meetingId} → ${msg.targetLanguage}`,
            );
            break;
          }

          case "transcript": {
            // Manual transcript input (for demo/testing)
            if (!meetingId) {
              send(socket, {
                type: "error",
                message: "Not joined to a meeting. Send 'join' first.",
              });
              return;
            }

            const session = getSession(meetingId);
            if (session) {
              await session.processTranscript(
                msg.speaker ?? "Speaker",
                msg.text ?? "",
              );
            }
            break;
          }
        }
      } catch (err) {
        console.error(`[panel] Error:`, err);
        send(socket, {
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });

    socket.on("close", () => {
      console.log(`[panel] Client disconnected: ${clientId}`);
      if (meetingId && userId) {
        getSession(meetingId)?.removeParticipant(userId);
      }
    });
  });

  // REST endpoint to push transcripts (from Graph webhook or external source)
  fastify.post("/api/meeting/:meetingId/transcript", async (request, reply) => {
    const { meetingId } = request.params as { meetingId: string };
    const { speaker, text } = request.body as {
      speaker: string;
      text: string;
    };

    const session = getSession(meetingId);
    if (!session) {
      return reply.code(404).send({ error: "Meeting session not found" });
    }

    await session.processTranscript(speaker, text);
    return reply.code(200).send({ ok: true });
  });
}

function send(socket: WsSocket, data: Record<string, unknown>): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}
