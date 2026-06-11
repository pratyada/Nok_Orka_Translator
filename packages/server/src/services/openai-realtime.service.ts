import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { OPENAI_REALTIME_CONFIG } from "@orka/shared";
import type { LanguageCode } from "@orka/shared";
import { config } from "../config/index.js";
import { getLanguageName } from "../config/languages.js";

/**
 * Events emitted:
 * - original_transcript(text: string, isFinal: boolean)
 * - translated_text(text: string, isFinal: boolean)
 * - translated_audio(audioData: Buffer)
 * - error(error: Error)
 * - connected()
 * - disconnected()
 */
export class OpenAIRealtimeService extends EventEmitter {
  private ws: WebSocket | null = null;
  private source: LanguageCode;
  private target: LanguageCode;
  private isConnected = false;

  constructor(source: LanguageCode, target: LanguageCode) {
    super();
    this.source = source;
    this.target = target;
  }

  async connect(): Promise<void> {
    const url = `${OPENAI_REALTIME_CONFIG.baseUrl}?model=${OPENAI_REALTIME_CONFIG.model}`;

    console.log(`[realtime] Connecting to ${OPENAI_REALTIME_CONFIG.model}...`);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${config.openai.apiKey}`,
        },
      });

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
        this.ws?.close();
      }, 10_000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        this.isConnected = true;
        console.log(`[realtime] Connected, configuring session...`);
      });

      this.ws.on("message", (data) => {
        const raw = data.toString();
        try {
          const event = JSON.parse(raw);

          // Handle session.created to send config
          if (event.type === "session.created") {
            this.configureSession();
            return;
          }

          // Session is ready after update
          if (event.type === "session.updated") {
            console.log(`[realtime] Session ready: ${this.source} -> ${this.target}`);
            this.emit("connected");
            resolve();
            return;
          }

          this.handleMessage(event);
        } catch {
          this.emit("error", new Error("Failed to parse realtime message"));
        }
      });

      this.ws.on("close", (code, reason) => {
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

  private configureSession(): void {
    const sourceName = getLanguageName(this.source);
    const targetName = getLanguageName(this.target);
    // ISO 639-1 code for Whisper language hint
    const sourceCode = this.source;

    // GA Realtime API format
    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: `You are a real-time translator for Nokia business meetings.

IMPORTANT: The speaker is speaking in ${sourceName} (language code: ${sourceCode}).
Translate ALL speech from ${sourceName} to ${targetName}.
Output ONLY the ${targetName} translation. Do not output the original text.
Do not add explanations, greetings, or commentary.
Preserve Nokia-specific product names and telecom terminology without translation.
If you cannot understand what was said, output "[unclear]" in ${targetName}.`,
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            transcription: {
              model: "whisper-1",
              language: sourceCode,
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

    const base64Audio = pcmData.toString("base64");
    this.send({
      type: "input_audio_buffer.append",
      audio: base64Audio,
    });
  }

  private handleMessage(event: Record<string, any>): void {
    switch (event.type) {
      // Original speech transcription
      case "conversation.item.input_audio_transcription.delta":
        this.emit("original_transcript", event.delta ?? "", false);
        break;

      case "conversation.item.input_audio_transcription.completed":
        this.emit("original_transcript", event.transcript ?? "", true);
        break;

      // Translation text streaming (GA API uses "output_audio_transcript")
      case "response.output_audio_transcript.delta":
        this.emit("translated_text", event.delta ?? "", false);
        break;

      case "response.output_audio_transcript.done":
        this.emit("translated_text", event.transcript ?? "", true);
        break;

      // Also handle older event names as fallback
      case "response.audio_transcript.delta":
        this.emit("translated_text", event.delta ?? "", false);
        break;

      case "response.audio_transcript.done":
        this.emit("translated_text", event.transcript ?? "", true);
        break;

      // Translated audio streaming (GA API uses "output_audio")
      case "response.output_audio.delta":
      case "response.audio.delta":
        if (event.delta) {
          const audioBuffer = Buffer.from(event.delta, "base64");
          this.emit("translated_audio", audioBuffer);
        }
        break;

      case "error":
        console.error(`[realtime] API error:`, event.error?.message);
        this.emit(
          "error",
          new Error(event.error?.message ?? "Unknown realtime error"),
        );
        break;

      case "response.created":
        console.log(`[realtime] ${event.type}:`, JSON.stringify(event).slice(0, 300));
        break;
      case "response.done":
        console.log(`[realtime] ${event.type}:`, JSON.stringify(event).slice(0, 500));
        break;
      case "response.output_item.added":
      case "response.output_item.done":
      case "response.content_part.added":
      case "response.content_part.done":
      case "response.audio.done":
      case "response.output_audio.done":
      case "input_audio_buffer.speech_started":
      case "input_audio_buffer.speech_stopped":
      case "input_audio_buffer.committed":
      case "conversation.item.created":
      case "conversation.item.added":
      case "conversation.item.done":
      case "rate_limits.updated":
        console.log(`[realtime] ${event.type}`);
        break;

      default:
        console.log(`[realtime] unhandled: ${event.type}`, JSON.stringify(event).slice(0, 500));
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
