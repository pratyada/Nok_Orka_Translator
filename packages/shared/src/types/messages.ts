import type { LanguageCode } from "./languages.js";

// Client -> Server messages
export type ClientMessage =
  | StartListeningMessage
  | StopListeningMessage
  | AudioChunkMessage;

export interface StartListeningMessage {
  type: "start_listening";
  /** The language the user wants to hear translations in */
  targetLanguage: LanguageCode;
}

export interface StopListeningMessage {
  type: "stop_listening";
}

export interface AudioChunkMessage {
  type: "audio_chunk";
  /** Base64-encoded PCM audio data (24kHz, 16-bit, mono) */
  data: string;
}

// Server -> Client messages
export type ServerMessage =
  | SessionReadyMessage
  | TranscriptMessage
  | TranslatedTextMessage
  | TranslatedAudioMessage
  | TurnSkippedMessage
  | ErrorMessage
  | SessionEndedMessage;

export interface SessionReadyMessage {
  type: "session_ready";
  sessionId: string;
  targetLanguage: LanguageCode;
}

/** Raw transcription of what was heard, in the language it was spoken */
export interface TranscriptMessage {
  type: "transcript";
  turnId: string;
  text: string;
  isFinal: boolean;
  /** ISO 639-1 code Whisper detected, if available */
  detectedLanguage?: LanguageCode;
}

/** Translation streamed back. Absent when input language already matches target. */
export interface TranslatedTextMessage {
  type: "translated_text";
  turnId: string;
  text: string;
  isFinal: boolean;
}

export interface TranslatedAudioMessage {
  type: "translated_audio";
  turnId: string;
  /** Base64-encoded audio */
  data: string;
  format: "pcm" | "mp3" | "opus";
}

/** Speaker's language matched the listener's target — no translation produced. */
export interface TurnSkippedMessage {
  type: "turn_skipped";
  turnId: string;
  reason: "same_language";
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export interface SessionEndedMessage {
  type: "session_ended";
  sessionId: string;
  durationMs: number;
}
