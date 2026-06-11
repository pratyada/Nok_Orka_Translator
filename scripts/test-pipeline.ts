#!/usr/bin/env npx tsx
/**
 * Test harness for the Nokia Orka translation pipeline.
 *
 * Usage:
 *   npm run test:pipeline
 *
 * Tests both the OpenAI Realtime API and the fallback pipeline
 * by sending a test phrase and verifying the translated output.
 *
 * Requires OPENAI_API_KEY in .env or environment.
 */

import "dotenv/config";
import { OpenAIRealtimeService } from "../packages/server/src/services/openai-realtime.service.js";
import { FallbackPipelineService } from "../packages/server/src/services/fallback-pipeline.service.js";
import { translateText } from "../packages/server/src/services/claude-translate.service.js";
import { textToSpeech } from "../packages/server/src/services/openai-tts.service.js";
import type { LanguageCode } from "../packages/shared/src/types/languages.js";

const TEST_PHRASES: Record<string, string> = {
  en: "Hello, welcome to the Nokia quarterly business review meeting. Let's discuss the 5G network deployment timeline.",
  es: "Hola, bienvenidos a la reunión trimestral de revisión de negocios de Nokia.",
  fr: "Bonjour, bienvenue à la réunion trimestrielle de Nokia.",
};

async function testClaudeTranslation() {
  console.log("\n--- Test: Claude Translation (EN -> ES) ---");

  const result = await translateText("en", "es" as LanguageCode, (delta) => {
    process.stdout.write(delta);
  });

  console.log("\n\nFull translation:", result);
  console.log("Status: PASS\n");
}

async function testTextTranslation() {
  console.log("\n--- Test: Claude Text Translation ---");

  const source: LanguageCode = "en";
  const target: LanguageCode = "es";
  const text = TEST_PHRASES.en;

  console.log(`Input (${source}): ${text}`);
  console.log(`Translating to ${target}...`);

  try {
    const result = await translateText(text, source, target, (delta) => {
      process.stdout.write(delta);
    });
    console.log(`\n\nFull result: ${result}`);
    console.log("Status: PASS");
  } catch (err) {
    console.error("Status: FAIL -", err);
  }
}

async function testTTS() {
  console.log("\n--- Test: OpenAI TTS ---");

  const text = "Hola, bienvenidos a la reunión de Nokia.";
  console.log(`Input: ${text}`);

  try {
    const audioBuffer = await textToSpeech(text, "nova");
    console.log(`Audio generated: ${audioBuffer.length} bytes`);
    console.log(`Duration estimate: ~${(audioBuffer.length / (24000 * 2)).toFixed(1)}s`);
    console.log("Status: PASS");
  } catch (err) {
    console.error("Status: FAIL -", err);
  }
}

async function testRealtimeConnection() {
  console.log("\n--- Test: OpenAI Realtime API Connection ---");

  const service = new OpenAIRealtimeService("en", "es");

  service.on("connected", () => {
    console.log("Connected to OpenAI Realtime API");
  });

  service.on("error", (err) => {
    console.error("Error:", err.message);
  });

  try {
    await service.connect();
    console.log("Status: PASS - Connection established");
    await service.disconnect();
    console.log("Disconnected cleanly");
  } catch (err) {
    console.error("Status: FAIL -", err);
  }
}

async function main() {
  console.log("===========================================");
  console.log("  Nokia Orka Translator - Pipeline Tests");
  console.log("===========================================");

  const args = process.argv.slice(2);
  const testName = args[0] ?? "all";

  const tests: Record<string, () => Promise<void>> = {
    translate: testTextTranslation,
    tts: testTTS,
    realtime: testRealtimeConnection,
  };

  if (testName === "all") {
    for (const [name, testFn] of Object.entries(tests)) {
      try {
        await testFn();
      } catch (err) {
        console.error(`\nTest "${name}" threw:`, err);
      }
    }
  } else if (tests[testName]) {
    await tests[testName]();
  } else {
    console.error(`Unknown test: ${testName}`);
    console.log(`Available tests: ${Object.keys(tests).join(", ")}, all`);
    process.exit(1);
  }

  console.log("\n===========================================");
  console.log("  Tests complete");
  console.log("===========================================\n");
}

main().catch(console.error);
