import { randomUUID } from "node:crypto";
import type { LanguageCode } from "@orka/shared";
import { OpenAIRealtimeService } from "./openai-realtime.service.js";
import { FallbackPipelineService } from "./fallback-pipeline.service.js";

export interface TranslationSession {
  id: string;
  source: LanguageCode;
  target: LanguageCode;
  engine: "realtime" | "fallback";
  service: OpenAIRealtimeService | FallbackPipelineService;
  startedAt: Date;
}

/**
 * Manages active translation sessions.
 * Each WebSocket client gets one session at a time.
 */
export class SessionManager {
  private sessions = new Map<string, TranslationSession>();

  async createSession(
    clientId: string,
    source: LanguageCode,
    target: LanguageCode,
    useFallback = false,
  ): Promise<TranslationSession> {
    // End any existing session for this client
    await this.endSession(clientId);

    const sessionId = randomUUID();
    let service: OpenAIRealtimeService | FallbackPipelineService;
    let engine: "realtime" | "fallback";

    if (useFallback) {
      service = new FallbackPipelineService(source, target);
      engine = "fallback";
    } else {
      service = new OpenAIRealtimeService(source, target);
      engine = "realtime";
    }

    try {
      await service.connect();
    } catch (err) {
      // If realtime fails, fall back automatically
      if (!useFallback && engine === "realtime") {
        console.warn(
          `[session] Realtime API failed, falling back to pipeline: ${err}`,
        );
        service = new FallbackPipelineService(source, target);
        engine = "fallback";
        await service.connect();
      } else {
        throw err;
      }
    }

    const session: TranslationSession = {
      id: sessionId,
      source,
      target,
      engine,
      service,
      startedAt: new Date(),
    };

    this.sessions.set(clientId, session);
    return session;
  }

  getSession(clientId: string): TranslationSession | undefined {
    return this.sessions.get(clientId);
  }

  async endSession(clientId: string): Promise<number | null> {
    const session = this.sessions.get(clientId);
    if (!session) return null;

    const durationMs = Date.now() - session.startedAt.getTime();
    await session.service.disconnect();
    this.sessions.delete(clientId);
    return durationMs;
  }

  get activeCount(): number {
    return this.sessions.size;
  }

  async shutdown(): Promise<void> {
    const clientIds = [...this.sessions.keys()];
    await Promise.all(clientIds.map((id) => this.endSession(id)));
  }
}
