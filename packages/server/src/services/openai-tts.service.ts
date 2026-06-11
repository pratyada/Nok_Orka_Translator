import OpenAI from "openai";
import { config } from "../config/index.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return client;
}

export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

/**
 * Convert text to speech using OpenAI TTS.
 * Returns PCM audio buffer for low-latency playback.
 */
export async function textToSpeech(
  text: string,
  voice: TTSVoice = "nova",
): Promise<Buffer> {
  const openai = getClient();

  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
    response_format: "pcm",
    speed: 1.0,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Stream TTS audio in chunks for real-time playback.
 * Calls onChunk with each PCM buffer as it arrives.
 */
export async function textToSpeechStream(
  text: string,
  onChunk: (chunk: Buffer) => void,
  voice: TTSVoice = "nova",
): Promise<void> {
  const openai = getClient();

  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
    response_format: "pcm",
    speed: 1.0,
  });

  // Use arrayBuffer and chunk it manually for Node.js compatibility
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const chunkSize = 4800; // 100ms at 24kHz 16-bit mono

  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, buffer.length);
    onChunk(buffer.subarray(offset, end));
  }
}
