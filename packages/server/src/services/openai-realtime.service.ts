import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { OPENAI_REALTIME_CONFIG } from "@orka/shared";
import type { LanguageCode } from "@orka/shared";
import { config } from "../config/index.js";
import { getLanguageName } from "../config/languages.js";

/**
 * Multi-party translator: listens to a stream of speech from any language,
 * translates each turn to `target`. If the spoken language already matches
 * `target`, the model is instructed to stay silent (no translated output).
 *
 * Events:
 * - transcript(turnId, text, isFinal)
 * - translated_text(turnId, text, isFinal)
 * - translated_audio(turnId, audioData: Buffer)
 * - turn_skipped(turnId, reason)
 * - error(Error)
 * - connected()
 * - disconnected()
 */
export class OpenAIRealtimeService extends EventEmitter {
  private ws: WebSocket | null = null;
  private target: LanguageCode;
  private isConnected = false;
  private currentTurnId: string | null = null;
  private currentTurnEmittedOutput = false;

  constructor(target: LanguageCode) {
    super();
    this.target = target;
  }

  async connect(): Promise<void> {
    const url = `${OPENAI_REALTIME_CONFIG.baseUrl}?model=${OPENAI_REALTIME_CONFIG.model}`;
    console.log(`[realtime] Connecting to ${OPENAI_REALTIME_CONFIG.model} (target=${this.target})...`);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${config.openai.apiKey}` },
      });

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
        this.ws?.close();
      }, 10_000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        this.isConnected = true;
      });

      this.ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());
          if (event.type === "session.created") {
            this.configureSession();
            return;
          }
          if (event.type === "session.updated") {
            console.log(`[realtime] Session ready → ${this.target}`);
            this.emit("connected");
            resolve();
            return;
          }
          this.handleMessage(event);
        } catch {
          this.emit("error", new Error("Failed to parse realtime message"));
        }
      });

      this.ws.on("close", (code) => {
        console.log(`[realtime] Closed: ${code}`);
        this.isConnected = false;
        this.emit("disconnected");
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        console.error(`[realtime] Error:`, err.message);
        this.emit("error", err);
        reject(err);
      });
    });
  }

  private buildInstructions(): string {
    // Accent-normalization mode: render ALL speech (including English in any
    // accent/dialect) as clear, neutral, standard English. Never stays silent.
    if (this.target === "en-clear") {
      return `You are a real-time English clarifier for Nokia business meetings.

Participants speak with many different accents and dialects (Indian, Finnish, Chinese, American, British, and more). Your task: render EVERYTHING you hear as clear, neutral, standard English — in both audio and text.

CRITICAL RULES:
1. ALWAYS produce output. Never stay silent, even when the speaker is already speaking English.
2. If the speech is English in any accent or dialect, rewrite it into clear, grammatically standard, neutral-accent English. Smooth out accent-driven errors, filler, and broken grammar while preserving the exact meaning and intent.
3. If the speech is in another language, translate it into clear, standard English.
4. Output ONLY the clarified English. No greetings, commentary, or explanations.
5. Preserve Nokia-specific product names, people names, and telecom terminology.
6. Speak the output in a neutral, easy-to-understand English accent.
7. If you cannot understand the speech, output "[unclear]".`;
    }

    const targetName = getLanguageName(this.target);
    return `You are a real-time translator for Nokia business meetings.

Your task: translate the speech you hear into ${targetName} (language code: ${this.target}).

CRITICAL RULES:
1. If the spoken language is ALREADY ${targetName}, produce NO audio output and NO text response. Stay completely silent.
2. Otherwise, translate the speech accurately to ${targetName}.
3. Output ONLY the ${targetName} translation. Do not add greetings, commentary, or explanations.
4. Preserve Nokia-specific product names, people names, and telecom terminology without translating them.
5. If you cannot understand the speech, output "[unclear]" in ${targetName}.`;
  }

  private configureSession(): void {
    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: this.buildInstructions(),
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            transcription: {
              model: "whisper-1",
              // no language hint — let Whisper auto-detect per turn
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.6,
              prefix_padding_ms: 500,
              silence_duration_ms: 1500,
              interrupt_response: false,
            },
          },
          output: {
            format: { type: "audio/pcm", rate: 24000 },
            voice: "alloy",
          },
        },
      },
    });
  }

  sendAudio(pcmData: Buffer): void {
    if (!this.isConnected || !this.ws) return;
    this.send({
      type: "input_audio_buffer.append",
      audio: pcmData.toString("base64"),
    });
  }

  private ensureTurnId(): string {
    if (!this.currentTurnId) {
      this.currentTurnId = randomUUID();
      this.currentTurnEmittedOutput = false;
    }
    return this.currentTurnId;
  }

  private handleMessage(event: Record<string, any>): void {
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        // New turn boundary
        this.currentTurnId = randomUUID();
        this.currentTurnEmittedOutput = false;
        break;

      case "conversation.item.input_audio_transcription.delta":
        this.emit("transcript", this.ensureTurnId(), event.delta ?? "", false);
        break;

      case "conversation.item.input_audio_transcription.completed":
        this.emit("transcript", this.ensureTurnId(), event.transcript ?? "", true);
        break;

      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        if (event.delta) {
          this.currentTurnEmittedOutput = true;
          this.emit("translated_text", this.ensureTurnId(), event.delta, false);
        }
        break;

      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        if (event.transcript) {
          this.currentTurnEmittedOutput = true;
          this.emit("translated_text", this.ensureTurnId(), event.transcript, true);
        }
        break;

      case "response.output_audio.delta":
      case "response.audio.delta":
        if (event.delta) {
          this.currentTurnEmittedOutput = true;
          const audioBuffer = Buffer.from(event.delta, "base64");
          this.emit("translated_audio", this.ensureTurnId(), audioBuffer);
        }
        break;

      case "response.done": {
        const turnId = this.currentTurnId;
        if (turnId && !this.currentTurnEmittedOutput) {
          this.emit("turn_skipped", turnId, "same_language");
        }
        // Reset for next turn — next speech_started will mint a new id
        this.currentTurnId = null;
        this.currentTurnEmittedOutput = false;
        break;
      }

      case "error":
        console.error(`[realtime] API error:`, event.error?.message);
        this.emit("error", new Error(event.error?.message ?? "Unknown realtime error"));
        break;

      case "response.created":
      case "response.output_item.added":
      case "response.output_item.done":
      case "response.content_part.added":
      case "response.content_part.done":
      case "response.audio.done":
      case "response.output_audio.done":
      case "input_audio_buffer.speech_stopped":
      case "input_audio_buffer.committed":
      case "conversation.item.created":
      case "conversation.item.added":
      case "conversation.item.done":
      case "rate_limits.updated":
        // Tracked but not surfaced
        break;

      default:
        console.log(`[realtime] unhandled: ${event.type}`);
    }
  }

  private send(event: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
