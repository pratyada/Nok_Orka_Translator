import WebSocket from "ws";
import { EventEmitter } from "node:events";
import type { LanguageCode } from "@orka/shared";
import { AUDIO_CONFIG } from "@orka/shared";
import { config } from "../config/index.js";
import { getBcp47 } from "../config/languages.js";

/**
 * Events emitted:
 * - transcript(text: string, isFinal: boolean)
 * - error(error: Error)
 * - connected()
 * - disconnected()
 */
export class DeepgramSTTService extends EventEmitter {
  private ws: WebSocket | null = null;
  private language: LanguageCode;
  private isConnected = false;

  constructor(language: LanguageCode) {
    super();
    this.language = language;
  }

  async connect(): Promise<void> {
    const bcp47 = getBcp47(this.language);
    const params = new URLSearchParams({
      model: "nova-3",
      language: bcp47.split("-")[0],
      encoding: "linear16",
      sample_rate: String(AUDIO_CONFIG.sampleRate),
      channels: String(AUDIO_CONFIG.channels),
      punctuate: "true",
      interim_results: "true",
      endpointing: "300",
    });

    const url = `wss://api.deepgram.com/v1/listen?${params}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${config.deepgram.apiKey}`,
        },
      });

      const timeout = setTimeout(() => {
        reject(new Error("Deepgram connection timeout"));
        this.ws?.close();
      }, 10_000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("close", () => {
        this.isConnected = false;
        this.emit("disconnected");
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        this.emit("error", err);
        reject(err);
      });
    });
  }

  sendAudio(pcmData: Buffer): void {
    if (!this.isConnected || !this.ws) return;
    this.ws.send(pcmData);
  }

  private handleMessage(raw: string): void {
    try {
      const response = JSON.parse(raw);

      if (response.type === "Results" && response.channel?.alternatives?.[0]) {
        const alt = response.channel.alternatives[0];
        const transcript: string = alt.transcript ?? "";
        const isFinal: boolean = response.is_final === true;

        if (transcript) {
          this.emit("transcript", transcript, isFinal);
        }
      }
    } catch {
      this.emit("error", new Error("Failed to parse Deepgram response"));
    }
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
