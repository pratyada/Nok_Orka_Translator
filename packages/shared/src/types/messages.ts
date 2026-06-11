import type { LanguageCode } from "./languages.js";

/** Which audio stream: outgoing (my mic) or incoming (what I hear) */
export type StreamDirection = "outgoing" | "incoming";

// Client -> Server messages
export type ClientMessage =
  | StartConversationMessage
  | StopTranslationMessage
  | AudioChunkMessage;

export interface StartConversationMessage {
  type: "start_conversation";
  /** Language I speak */
  myLanguage: LanguageCode;
  /** Language the other person speaks */
  theirLanguage: LanguageCode;
  useFallback?: boolean;
}

export interface StopTranslationMessage {
  type: "stop_translation";
}

export interface AudioChunkMessage {
  type: "audio_chunk";
  /** Which stream this audio belongs to */
  stream: StreamDirection;
  /** Base64-encoded PCM audio data (24kHz, 16-bit, mono) */
  data: string;
}

// Server -> Client messages
export type ServerMessage =
  | ConversationReadyMessage
  | TranscriptMessage
  | TranslatedTextMessage
  | TranslatedAudioMessage
  | ErrorMessage
  | SessionEndedMessage;

export interface ConversationReadyMessage {
  type: "conversation_ready";
  sessionId: string;
  myLanguage: LanguageCode;
  theirLanguage: LanguageCode;
}

export interface TranscriptMessage {
  type: "transcript";
  stream: StreamDirection;
  text: string;
  isFinal: boolean;
}

export interface TranslatedTextMessage {
  type: "translated_text";
  stream: StreamDirection;
  text: string;
  isFinal: boolean;
}

export interface TranslatedAudioMessage {
  type: "translated_audio";
  stream: StreamDirection;
  /** Base64-encoded audio data */
  data: string;
  format: "pcm" | "mp3" | "opus";
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
