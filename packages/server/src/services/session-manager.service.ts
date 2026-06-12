import { randomUUID } from "node:crypto";
import type { LanguageCode } from "@orka/shared";
import { OpenAIRealtimeService } from "./openai-realtime.service.js";

export interface TranslationSession {
  id: string;
  target: LanguageCode;
  service: OpenAIRealtimeService;
  startedAt: Date;
}

/**
 * Tracks active multi-party translation sessions for health/metrics.
 * Each WebSocket client gets one session at a time.
 */
export class SessionManager {
  private sessions = new Map<string, TranslationSession>();

  async createSession(
    clientId: string,
    target: LanguageCode,
  ): Promise<TranslationSession> {
    await this.endSession(clientId);

    const service = new OpenAIRealtimeService(target);
    await service.connect();

    const session: TranslationSession = {
      id: randomUUID(),
      target,
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
