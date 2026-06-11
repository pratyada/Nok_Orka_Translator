/** Audio format for mic capture and streaming */
export const AUDIO_CONFIG = {
  sampleRate: 24000,
  channels: 1,
  bitDepth: 16,
  /** Size of each audio chunk sent over WebSocket (in bytes) */
  chunkSize: 4800, // 100ms at 24kHz 16-bit mono
} as const;

/** WebSocket configuration */
export const WS_CONFIG = {
  /** Heartbeat interval in ms */
  pingInterval: 30_000,
  /** Connection timeout in ms */
  connectionTimeout: 10_000,
  /** Max reconnect attempts */
  maxReconnectAttempts: 5,
} as const;

/** OpenAI Realtime API configuration */
export const OPENAI_REALTIME_CONFIG = {
  model: "gpt-realtime",
  baseUrl: "wss://api.openai.com/v1/realtime",
} as const;
