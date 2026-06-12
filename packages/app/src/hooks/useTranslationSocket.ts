import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  ServerMessage,
  LanguageCode,
} from "@orka/shared";

export interface Turn {
  turnId: string;
  originalText: string;
  translatedText: string;
  skipped: boolean; // true if same-language passthrough
  originalFinal: boolean;
  translatedFinal: boolean;
  startedAt: number;
}

export interface ListenerState {
  isConnected: boolean;
  isActive: boolean;
  sessionId: string | null;
  targetLanguage: LanguageCode | null;
  turns: Turn[];
  error: string | null;
}

interface ListenerCallbacks {
  onTranslatedAudio?: (turnId: string, pcmData: ArrayBuffer) => void;
}

// Global WebSocket singleton — survives React StrictMode
let globalWs: WebSocket | null = null;
let globalListeners: ((msg: ServerMessage) => void)[] = [];

function getOrCreateWs(): WebSocket {
  if (
    globalWs &&
    (globalWs.readyState === WebSocket.OPEN ||
      globalWs.readyState === WebSocket.CONNECTING)
  ) {
    return globalWs;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/translate`;
  console.log("[orka] Creating WebSocket:", wsUrl);

  const ws = new WebSocket(wsUrl);
  globalWs = ws;

  ws.onopen = () => console.log("[orka] WebSocket OPEN");
  ws.onmessage = (event) => {
    try {
      const msg: ServerMessage = JSON.parse(event.data);
      globalListeners.forEach((fn) => fn(msg));
    } catch (err) {
      console.error("[orka] Parse error:", err);
    }
  };
  ws.onclose = (e) => {
    console.log("[orka] WebSocket CLOSED:", e.code);
    globalWs = null;
    setTimeout(() => getOrCreateWs(), 3000);
  };
  ws.onerror = () => console.error("[orka] WebSocket ERROR");

  return ws;
}

function wsSend(msg: ClientMessage): boolean {
  const ws = globalWs;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  console.warn("[orka] Cannot send, ws not open");
  return false;
}

function newEmptyTurn(turnId: string): Turn {
  return {
    turnId,
    originalText: "",
    translatedText: "",
    skipped: false,
    originalFinal: false,
    translatedFinal: false,
    startedAt: Date.now(),
  };
}

export function useListenerSocket(callbacks?: ListenerCallbacks) {
  const [state, setState] = useState<ListenerState>({
    isConnected: false,
    isActive: false,
    sessionId: null,
    targetLanguage: null,
    turns: [],
    error: null,
  });

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const ws = getOrCreateWs();

    if (ws.readyState === WebSocket.OPEN) {
      setState((prev) => ({ ...prev, isConnected: true }));
    }

    const onOpen = () =>
      setState((prev) => ({ ...prev, isConnected: true, error: null }));
    const onClose = () =>
      setState((prev) => ({ ...prev, isConnected: false, isActive: false }));

    ws.addEventListener("open", onOpen);
    ws.addEventListener("close", onClose);

    function upsertTurn(
      turnId: string,
      mutate: (turn: Turn) => Turn,
    ): void {
      setState((prev) => {
        const idx = prev.turns.findIndex((t) => t.turnId === turnId);
        if (idx === -1) {
          return {
            ...prev,
            turns: [...prev.turns, mutate(newEmptyTurn(turnId))],
          };
        }
        const updated = [...prev.turns];
        updated[idx] = mutate(updated[idx]);
        return { ...prev, turns: updated };
      });
    }

    function handleMessage(message: ServerMessage) {
      switch (message.type) {
        case "session_ready":
          console.log("[orka] Session ready, target =", message.targetLanguage);
          setState((prev) => ({
            ...prev,
            isActive: true,
            sessionId: message.sessionId,
            targetLanguage: message.targetLanguage,
            turns: [],
            error: null,
          }));
          break;

        case "transcript":
          upsertTurn(message.turnId, (turn) => ({
            ...turn,
            originalText: message.isFinal
              ? message.text
              : (turn.originalText || "") + message.text,
            originalFinal: message.isFinal,
          }));
          break;

        case "translated_text":
          upsertTurn(message.turnId, (turn) => ({
            ...turn,
            translatedText: message.isFinal
              ? message.text
              : (turn.translatedText || "") + message.text,
            translatedFinal: message.isFinal,
          }));
          break;

        case "translated_audio":
          if (callbacksRef.current?.onTranslatedAudio) {
            const binary = atob(message.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            callbacksRef.current.onTranslatedAudio(
              message.turnId,
              bytes.buffer,
            );
          }
          break;

        case "turn_skipped":
          upsertTurn(message.turnId, (turn) => ({
            ...turn,
            skipped: true,
            translatedFinal: true,
          }));
          break;

        case "error":
          console.error("[orka] Server error:", message.code, message.message);
          setState((prev) => ({
            ...prev,
            error: `${message.code}: ${message.message}`,
          }));
          break;

        case "session_ended":
          setState((prev) => ({
            ...prev,
            isActive: false,
            sessionId: null,
          }));
          break;
      }
    }

    globalListeners.push(handleMessage);

    return () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("close", onClose);
      globalListeners = globalListeners.filter((fn) => fn !== handleMessage);
    };
  }, []);

  const startListening = useCallback((targetLanguage: LanguageCode) => {
    setState((prev) => ({ ...prev, turns: [] }));
    console.log(`[orka] >> start_listening ${targetLanguage}`);
    wsSend({ type: "start_listening", targetLanguage });
  }, []);

  const stopListening = useCallback(() => {
    console.log("[orka] >> stop_listening");
    wsSend({ type: "stop_listening" });
  }, []);

  const sendAudio = useCallback((pcmData: ArrayBuffer) => {
    const bytes = new Uint8Array(pcmData);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    wsSend({ type: "audio_chunk", data: base64 });
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    sendAudio,
  };
}
