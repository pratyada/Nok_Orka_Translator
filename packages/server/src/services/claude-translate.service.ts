import Anthropic from "@anthropic-ai/sdk";
import type { LanguageCode } from "@orka/shared";
import { config } from "../config/index.js";
import { buildTranslationPrompt } from "../config/languages.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

/**
 * Translate text using Claude.
 * Uses streaming for low-latency partial results.
 */
export async function translateText(
  text: string,
  source: LanguageCode,
  target: LanguageCode,
  onDelta?: (delta: string) => void,
): Promise<string> {
  const anthropic = getClient();
  const systemPrompt = buildTranslationPrompt(source, target);

  let fullTranslation = "";

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullTranslation += event.delta.text;
      onDelta?.(event.delta.text);
    }
  }

  return fullTranslation;
}

/**
 * Batch translate — no streaming, returns full result.
 * Useful for post-processing transcripts.
 */
export async function translateBatch(
  texts: string[],
  source: LanguageCode,
  target: LanguageCode,
): Promise<string[]> {
  const anthropic = getClient();
  const systemPrompt = buildTranslationPrompt(source, target);

  const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system:
      systemPrompt +
      "\n\nTranslate each numbered line. Output only the translations with matching numbers.",
    messages: [{ role: "user", content: numbered }],
  });

  const content = response.content[0];
  if (content.type !== "text") return [];

  return content.text
    .split("\n")
    .filter((line) => line.match(/^\[\d+\]/))
    .map((line) => line.replace(/^\[\d+\]\s*/, ""));
}
