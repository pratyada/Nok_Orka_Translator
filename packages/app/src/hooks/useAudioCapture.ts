import { useCallback, useRef, useState } from "react";
import { AUDIO_CONFIG } from "@orka/shared";

export type CaptureMode = "mic" | "system";

export interface AudioCaptureState {
  isCapturing: boolean;
  error: string | null;
  audioLevel: number;
  mode: CaptureMode;
}

// Check if running in Electron desktop app
const isDesktop = !!(window as any).orkaDesktop?.isDesktop;

/**
 * Hook for capturing audio — either from mic or system audio.
 *
 * "mic" mode: captures user's microphone (getUserMedia)
 * "system" mode: captures system audio output (what you hear from Teams)
 *   - In Electron: uses desktopCapturer + getDisplayMedia
 *   - In browser: uses getDisplayMedia with audio (Chrome tab audio)
 *
 * @param shouldSuppress optional gate — when it returns true, chunks are
 *   dropped instead of being forwarded. Used to break the
 *   render-loopback -> capture -> translate -> render feedback loop while
 *   translated audio is actively playing.
 */
export function useAudioCapture(
  onAudioChunk: (chunk: ArrayBuffer) => void,
  shouldSuppress?: () => boolean,
) {
  const [state, setState] = useState<AudioCaptureState>({
    isCapturing: false,
    error: null,
    audioLevel: 0,
    mode: "mic",
  });

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const startProcessing = useCallback(
    (stream: MediaStream, mode: CaptureMode) => {
      const context = new AudioContext({ sampleRate: AUDIO_CONFIG.sampleRate });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);

        // Audio level for visualization
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setState((prev) => ({ ...prev, audioLevel: Math.min(rms * 5, 1) }));

        // Suppress chunks while translated audio is playing to break
        // the render-loopback feedback loop.
        if (shouldSuppress?.()) return;

        // Convert Float32 to Int16 PCM
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        onAudioChunk(pcm16.buffer);
      };

      source.connect(processor);
      processor.connect(context.destination);

      streamRef.current = stream;
      contextRef.current = context;
      processorRef.current = processor;

      setState({ isCapturing: true, error: null, audioLevel: 0, mode });
    },
    [onAudioChunk],
  );

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: AUDIO_CONFIG.sampleRate,
          channelCount: AUDIO_CONFIG.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      startProcessing(stream, "mic");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to access microphone";
      setState((prev) => ({ ...prev, error: message }));
    }
  }, [startProcessing]);

  const startSystem = useCallback(async () => {
    try {
      let stream: MediaStream;

      if (isDesktop) {
        // Electron: use getDisplayMedia with system audio.
        // The main process auto-grants via setDisplayMediaRequestHandler,
        // returning a screen video source + "loopback" system audio.
        // Chromium requires a video track to be requested even when we only
        // want the audio — requesting `video: false` yields an empty/failed
        // stream, so we request video and immediately drop the track.
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        } as any);

        // We only need the loopback audio — discard the video track.
        stream.getVideoTracks().forEach((t) => t.stop());
      } else {
        // Browser: use getDisplayMedia — user picks a tab/screen to share
        // Chrome supports audio capture from tabs
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: { width: 1, height: 1 }, // Minimal video (required by API)
        });

        // Stop the video track — we only need audio
        stream.getVideoTracks().forEach((t) => t.stop());
      }

      if (!stream.getAudioTracks().length) {
        setState((prev) => ({
          ...prev,
          error: isDesktop
            ? "No system audio captured. Make sure to select 'Share audio' when prompted."
            : "No system audio captured. In the share picker choose 'Entire Screen' (not a single window) and turn ON 'Also share system audio'. For a meeting in a browser tab, pick that tab and enable 'Share tab audio'. Chrome or Edge only.",
        }));
        return;
      }

      startProcessing(stream, "system");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to capture system audio";
      setState((prev) => ({ ...prev, error: message }));
    }
  }, [startProcessing]);

  const start = useCallback(
    async (mode: CaptureMode = "mic") => {
      // Stop any existing capture
      stop();
      if (mode === "system") {
        await startSystem();
      } else {
        await startMic();
      }
    },
    [startMic, startSystem],
  );

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    contextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    processorRef.current = null;
    contextRef.current = null;
    streamRef.current = null;

    setState({ isCapturing: false, error: null, audioLevel: 0, mode: "mic" });
  }, []);

  return { ...state, start, stop, isDesktop };
}
