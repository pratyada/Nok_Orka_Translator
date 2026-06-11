import { EventEmitter } from "node:events";
import type { LanguageCode } from "@orka/shared";
import { translateAndSpeak, type TranslationResult } from "./translation.service.js";

export interface MeetingParticipant {
  userId: string;
  name: string;
  targetLanguage: LanguageCode;
}

/**
 * Manages a translation session for a single Teams meeting.
 * Tracks participants and their language preferences.
 *
 * Events:
 * - translation(result: TranslationResult, participant: MeetingParticipant)
 * - error(error: Error)
 */
export class MeetingSession extends EventEmitter {
  readonly meetingId: string;
  readonly sourceLanguage: LanguageCode;
  private participants = new Map<string, MeetingParticipant>();
  private isActive = false;

  constructor(meetingId: string, sourceLanguage: LanguageCode = "en") {
    super();
    this.meetingId = meetingId;
    this.sourceLanguage = sourceLanguage;
  }

  addParticipant(participant: MeetingParticipant): void {
    this.participants.set(participant.userId, participant);
    console.log(
      `[session] ${participant.name} joined with target: ${participant.targetLanguage}`,
    );
  }

  removeParticipant(userId: string): void {
    const p = this.participants.get(userId);
    if (p) {
      console.log(`[session] ${p.name} left`);
      this.participants.delete(userId);
    }
  }

  getParticipant(userId: string): MeetingParticipant | undefined {
    return this.participants.get(userId);
  }

  get participantCount(): number {
    return this.participants.size;
  }

  start(): void {
    this.isActive = true;
    console.log(`[session] Meeting ${this.meetingId} started`);
  }

  stop(): void {
    this.isActive = false;
    console.log(`[session] Meeting ${this.meetingId} stopped`);
  }

  /**
   * Process a transcript line from the meeting.
   * Translates for each participant who needs a different language.
   */
  async processTranscript(
    speaker: string,
    text: string,
    speakerLanguage?: LanguageCode,
  ): Promise<void> {
    if (!this.isActive || !text.trim()) return;

    const sourceLang = speakerLanguage ?? this.sourceLanguage;

    // Translate for each participant who needs a different language
    const uniqueTargets = new Set<LanguageCode>();
    const targetParticipants = new Map<LanguageCode, MeetingParticipant[]>();

    for (const participant of this.participants.values()) {
      if (participant.targetLanguage !== sourceLang) {
        uniqueTargets.add(participant.targetLanguage);
        const list = targetParticipants.get(participant.targetLanguage) ?? [];
        list.push(participant);
        targetParticipants.set(participant.targetLanguage, list);
      }
    }

    // Translate once per unique target language
    for (const targetLang of uniqueTargets) {
      try {
        const result = await translateAndSpeak(
          text,
          speaker,
          sourceLang,
          targetLang,
          true,
        );

        const participants = targetParticipants.get(targetLang) ?? [];
        for (const participant of participants) {
          this.emit("translation", result, participant);
        }
      } catch (err) {
        this.emit(
          "error",
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }
}

// Global session registry
const sessions = new Map<string, MeetingSession>();

export function getOrCreateSession(
  meetingId: string,
  sourceLanguage: LanguageCode = "en",
): MeetingSession {
  let session = sessions.get(meetingId);
  if (!session) {
    session = new MeetingSession(meetingId, sourceLanguage);
    sessions.set(meetingId, session);
  }
  return session;
}

export function getSession(meetingId: string): MeetingSession | undefined {
  return sessions.get(meetingId);
}

export function removeSession(meetingId: string): void {
  const session = sessions.get(meetingId);
  if (session) {
    session.stop();
    sessions.delete(meetingId);
  }
}
