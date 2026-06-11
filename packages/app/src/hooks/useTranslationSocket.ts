import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  ServerMessage,
  LanguageCode,
  StreamDirection,
} from "@orka/shared";

export interface ConversationState {
  isConnected: boolean;
  isActive: boolean;
  sessionId: string | null;
  /** What I said (my language) */
  outgoingOriginal: string;
  /** What I said translated (their language) */
  outgoingTranslated: string;
  /** What they said (their language) */
  incomingOriginal: string;
  /** What they said translated (my language) */
  incomingTranslated: string;
  error: string | null;
}

interface ConversationCallbacks {
  onTranslatedAudio?: (stream: StreamDirection, pcmData: ArrayBuffer) => void;
}

// Global WebSocket singleton — survives React StrictMode
let globalWs: WebSocket | null = null;
let globalListeners: ((msg: ServerMessage) => void)[] = [];

function getOrCreateWs(): WebSocket {
  if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) {
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
      console.log("[orka] <<", msg.type, "stream" in msg ? (msg as any).stream : "");
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

export function useConversationSocket(callbacks?: ConversationCallbacks) {
  const [state, setState] = useState<ConversationState>({
    isConnected: false,
    isActive: false,
    sessionId: null,
    outgoingOriginal: "",
    outgoingTranslated: "",
    incomingOriginal: "",
    incomingTranslated: "",
    error: null,
  });

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Text accumulators
  const outOrigRef = useRef("");
  const outTransRef = useRef("");
  const inOrigRef = useRef("");
  const inTransRef = useRef("");

  useEffect(() => {
    const ws = getOrCreateWs();

    if (ws.readyState === WebSocket.OPEN) {
      setState((prev) => ({ ...prev, isConnected: true }));
    }

    const onOpen = () => setState((prev) => ({ ...prev, isConnected: true, error: null }));
    const onClose = () => setState((prev) => ({ ...prev, isConnected: false, isActive: false }));

    ws.addEventListener("open", onOpen);
    ws.addEventListener("close", onClose);

    function handleMessage(message: ServerMessage) {
      switch (message.type) {
        case "conversation_ready":
          console.log("[orka] Conversation ready!");
          setState((prev) => ({
            ...prev,
            isActive: true,
            sessionId: message.sessionId,
            error: null,
          }));
          break;

        case "transcript": {
          const ref = message.stream === "outgoing" ? outOrigRef : inOrigRef;
          const field = message.stream === "outgoing" ? "outgoingOriginal" : "incomingOriginal";
          if (message.isFinal) {
            ref.current += (ref.current ? "\n" : "") + message.text;
          }
          setState((prev) => ({
            ...prev,
            [field]: message.isFinal
              ? ref.current
              : ref.current + (ref.current ? "\n" : "") + message.text,
          }));
          break;
        }

        case "translated_text": {
          const ref = message.stream === "outgoing" ? outTransRef : inTransRef;
          const field = message.stream === "outgoing" ? "outgoingTranslated" : "incomingTranslated";
          if (message.isFinal) {
            ref.current += (ref.current ? "\n" : "") + message.text;
          }
          setState((prev) => ({
            ...prev,
            [field]: message.isFinal
              ? ref.current
              : ref.current + (ref.current ? "\n" : "") + message.text,
          }));
          break;
        }

        case "translated_audio":
          if (callbacksRef.current?.onTranslatedAudio) {
            const binary = atob(message.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            callbacksRef.current.onTranslatedAudio(message.stream, bytes.buffer);
          }
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

  const startConversation = useCallback(
    (myLanguage: LanguageCode, theirLanguage: LanguageCode, useFallback = false) => {
      // Clear accumulators
      outOrigRef.current = "";
      outTransRef.current = "";
      inOrigRef.current = "";
      inTransRef.current = "";
      setState((prev) => ({
        ...prev,
        outgoingOriginal: "",
        outgoingTranslated: "",
        incomingOriginal: "",
        incomingTranslated: "",
      }));

      console.log(`[orka] >> start_conversation ${myLanguage} ↔ ${theirLanguage}`);
      wsSend({ type: "start_conversation", myLanguage, theirLanguage, useFallback });
    },
    [],
  );

  const stopConversation = useCallback(() => {
    console.log("[orka] >> stop_translation");
    wsSend({ type: "stop_translation" });
  }, []);

  const sendAudio = useCallback((stream: StreamDirection, pcmData: ArrayBuffer) => {
    const bytes = new Uint8Array(pcmData);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    wsSend({ type: "audio_chunk", stream, data: base64 });
  }, []);

  return {
    ...state,
    startConversation,
    stopConversation,
    sendAudio,
  };
}
