import OpenAI from "openai";
import { config } from "../config.js";
import type { LanguageCode } from "@orka/shared";
import { SUPPORTED_LANGUAGES } from "@orka/shared";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return openaiClient;
}

/**
 * Translate text using GPT-4o (fast, cost-effective for text translation).
 */
export async function translateText(
  text: string,
  source: LanguageCode,
  target: LanguageCode,
): Promise<string> {
  const openai = getOpenAI();
  const sourceName = SUPPORTED_LANGUAGES[source].name;
  const targetName = SUPPORTED_LANGUAGES[target].name;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a real-time translator for Nokia business meetings. Translate from ${sourceName} to ${targetName}. Preserve Nokia-specific product names and telecom terminology. Output only the translation, no explanations.`,
      },
      { role: "user", content: text },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Generate speech from translated text.
 * Returns PCM audio buffer.
 */
export async function textToSpeech(
  text: string,
  voice: "alloy" | "nova" | "shimmer" = "nova",
): Promise<Buffer> {
  const openai = getOpenAI();

  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
    response_format: "mp3",
    speed: 1.0,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  audioBuffer?: Buffer;
  speaker: string;
  timestamp: string;
}

/**
 * Full translation pipeline: text → translate → TTS.
 */
export async function translateAndSpeak(
  text: string,
  speaker: string,
  source: LanguageCode,
  target: LanguageCode,
  generateAudio = true,
): Promise<TranslationResult> {
  const translatedText = await translateText(text, source, target);

  let audioBuffer: Buffer | undefined;
  if (generateAudio && translatedText) {
    audioBuffer = await textToSpeech(translatedText);
  }

  return {
    originalText: text,
    translatedText,
    audioBuffer,
    speaker,
    timestamp: new Date().toISOString(),
  };
}
