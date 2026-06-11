import { EventEmitter } from "node:events";
import type { LanguageCode } from "@orka/shared";
import { DeepgramSTTService } from "./deepgram-stt.service.js";
import { translateText } from "./claude-translate.service.js";
import { textToSpeechStream } from "./openai-tts.service.js";

/**
 * Events emitted:
 * - original_transcript(text: string, isFinal: boolean)
 * - translated_text(text: string, isFinal: boolean)
 * - translated_audio(audioData: Buffer)
 * - error(error: Error)
 * - connected()
 * - disconnected()
 */
export class FallbackPipelineService extends EventEmitter {
  private stt: DeepgramSTTService;
  private source: LanguageCode;
  private target: LanguageCode;
  private pendingTranslation: AbortController | null = null;

  constructor(source: LanguageCode, target: LanguageCode) {
    super();
    this.source = source;
    this.target = target;
    this.stt = new DeepgramSTTService(source);
  }

  async connect(): Promise<void> {
    this.stt.on("transcript", (text: string, isFinal: boolean) => {
      this.emit("original_transcript", text, isFinal);

      if (isFinal && text.trim()) {
        this.processTranslation(text);
      }
    });

    this.stt.on("error", (err: Error) => this.emit("error", err));
    this.stt.on("disconnected", () => this.emit("disconnected"));

    await this.stt.connect();
    this.emit("connected");
  }

  sendAudio(pcmData: Buffer): void {
    this.stt.sendAudio(pcmData);
  }

  private async processTranslation(text: string): Promise<void> {
    try {
      this.pendingTranslation?.abort();
      this.pendingTranslation = new AbortController();

      const translatedText = await translateText(
        text,
        this.source,
        this.target,
        (delta: string) => {
          this.emit("translated_text", delta, false);
        },
      );

      this.emit("translated_text", translatedText, true);

      await textToSpeechStream(translatedText, (chunk: Buffer) => {
        this.emit("translated_audio", chunk);
      });
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        this.emit("error", err);
      }
    }
  }

  async disconnect(): Promise<void> {
    this.pendingTranslation?.abort();
    await this.stt.disconnect();
  }
}
