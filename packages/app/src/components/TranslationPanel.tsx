import React, { useCallback, useRef, useState } from "react";
import {
  Button,
  makeStyles,
  tokens,
  Switch,
  MessageBar,
  MessageBarBody,
  Text,
} from "@fluentui/react-components";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@orka/shared";
import type { StreamDirection } from "@orka/shared";
import { useConversationSocket } from "../hooks/useTranslationSocket";
import { useAudioCapture } from "../hooks/useAudioCapture";
import { AudioPlayer } from "../services/audio-player";
import { LanguageSelector } from "./LanguageSelector";
import { StatusIndicator } from "./StatusIndicator";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "16px 20px",
    gap: "12px",
  },
  controlBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 16px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    flexWrap: "wrap",
  },
  startBtn: {
    minWidth: "180px",
    fontWeight: 600,
  },
  stopBtn: {
    minWidth: "120px",
    backgroundColor: "#d13438",
    color: "#ffffff",
    fontWeight: 600,
    ":hover": { backgroundColor: "#b52b2e", color: "#ffffff" },
  },
  streams: {
    flex: 1,
    display: "flex",
    gap: "12px",
    minHeight: 0,
  },
  streamColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: 0,
  },
  columnHeader: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#124191",
    padding: "4px 0",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  pane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    overflow: "hidden",
    minHeight: 0,
  },
  paneHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottom: "1px solid #eee",
    fontSize: "12px",
    fontWeight: 600,
  },
  paneHeaderOut: { backgroundColor: "#fff8f0", color: "#b35900" },
  paneHeaderIn: { backgroundColor: "#f0f7ff", color: "#124191" },
  paneTag: {
    fontSize: "10px",
    padding: "2px 6px",
    borderRadius: "8px",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  paneContent: {
    flex: 1,
    padding: "10px 12px",
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    fontSize: "14px",
    lineHeight: "1.6",
  },
  placeholder: {
    color: tokens.colorNeutralForeground4,
    fontStyle: "italic",
    fontSize: "13px",
    textAlign: "center",
    padding: "20px",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  footerRight: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  switchLabel: {
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
  },
  levelBars: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
  },
  levelLabel: {
    fontSize: "10px",
    color: tokens.colorNeutralForeground3,
  },
});

export function TranslationPanel() {
  const styles = useStyles();
  const [myLang, setMyLang] = useState<LanguageCode>("hi");
  const [theirLang, setTheirLang] = useState<LanguageCode>("en");
  const [autoPlay, setAutoPlay] = useState(true);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  // Only play incoming audio (what they said, translated to my language)
  const handleTranslatedAudio = useCallback(
    (stream: StreamDirection, pcmData: ArrayBuffer) => {
      if (!autoPlay) return;
      if (stream !== "incoming") return; // Only play translations of what I hear
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new AudioPlayer();
      }
      audioPlayerRef.current.resume();
      audioPlayerRef.current.enqueue(pcmData);
    },
    [autoPlay],
  );

  const conv = useConversationSocket({
    onTranslatedAudio: handleTranslatedAudio,
  });

  const isActiveRef = useRef(false);
  isActiveRef.current = conv.isActive;

  // Mic capture (what I say)
  const mic = useAudioCapture(
    useCallback(
      (chunk: ArrayBuffer) => {
        if (isActiveRef.current) {
          conv.sendAudio("outgoing", chunk);
        }
      },
      [conv.sendAudio],
    ),
  );

  // System audio capture (what I hear from Teams)
  const system = useAudioCapture(
    useCallback(
      (chunk: ArrayBuffer) => {
        if (isActiveRef.current) {
          conv.sendAudio("incoming", chunk);
        }
      },
      [conv.sendAudio],
    ),
  );

  const handleStart = useCallback(async () => {
    conv.startConversation(myLang, theirLang);
    // Start both captures
    await mic.start("mic");
    try {
      await system.start("system");
    } catch {
      console.warn("[orka] System audio capture not available — mic-only mode");
    }
  }, [myLang, theirLang, conv, mic, system]);

  const handleStop = useCallback(() => {
    mic.stop();
    system.stop();
    conv.stopConversation();
    audioPlayerRef.current?.stop();
  }, [mic, system, conv]);

  const error = mic.error || system.error || conv.error;

  return (
    <div className={styles.root}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.controlBar}>
        <LanguageSelector
          source={myLang}
          target={theirLang}
          onSourceChange={setMyLang}
          onTargetChange={setTheirLang}
          disabled={conv.isActive}
          sourceLabel="I speak"
          targetLabel="They speak"
        />

        {!conv.isActive ? (
          <Button
            appearance="primary"
            size="large"
            className={styles.startBtn}
            onClick={handleStart}
            disabled={!conv.isConnected}
          >
            Start Conversation
          </Button>
        ) : (
          <Button
            size="large"
            className={styles.stopBtn}
            onClick={handleStop}
          >
            Stop
          </Button>
        )}
      </div>

      <div className={styles.streams}>
        {/* Left column: What I say */}
        <div className={styles.streamColumn}>
          <div className={styles.columnHeader}>
            What I Say ({SUPPORTED_LANGUAGES[myLang].name})
          </div>
          <div className={styles.pane}>
            <div className={`${styles.paneHeader} ${styles.paneHeaderOut}`}>
              <span>{SUPPORTED_LANGUAGES[myLang].name}</span>
              <span className={styles.paneTag}>My speech</span>
            </div>
            <div className={styles.paneContent}>
              {conv.outgoingOriginal || (
                <div className={styles.placeholder}>
                  {conv.isActive ? "Speak now..." : "Your speech appears here"}
                </div>
              )}
            </div>
          </div>
          <div className={styles.pane}>
            <div className={`${styles.paneHeader} ${styles.paneHeaderOut}`}>
              <span>{SUPPORTED_LANGUAGES[theirLang].name}</span>
              <span className={styles.paneTag}>They hear this</span>
            </div>
            <div className={styles.paneContent}>
              {conv.outgoingTranslated || (
                <div className={styles.placeholder}>
                  Translation for them
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: What they say */}
        <div className={styles.streamColumn}>
          <div className={styles.columnHeader}>
            What They Say ({SUPPORTED_LANGUAGES[theirLang].name})
          </div>
          <div className={styles.pane}>
            <div className={`${styles.paneHeader} ${styles.paneHeaderIn}`}>
              <span>{SUPPORTED_LANGUAGES[theirLang].name}</span>
              <span className={styles.paneTag}>Their speech</span>
            </div>
            <div className={styles.paneContent}>
              {conv.incomingOriginal || (
                <div className={styles.placeholder}>
                  {conv.isActive ? "Listening for their speech..." : "Their speech appears here"}
                </div>
              )}
            </div>
          </div>
          <div className={styles.pane}>
            <div className={`${styles.paneHeader} ${styles.paneHeaderIn}`}>
              <span>{SUPPORTED_LANGUAGES[myLang].name}</span>
              <span className={styles.paneTag}>I hear this</span>
            </div>
            <div className={styles.paneContent}>
              {conv.incomingTranslated || (
                <div className={styles.placeholder}>
                  Translation for me
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <StatusIndicator
          isConnected={conv.isConnected}
          isTranslating={conv.isActive}
          engine="realtime"
          audioLevel={Math.max(mic.audioLevel, system.audioLevel)}
        />
        <div className={styles.footerRight}>
          <div className={styles.levelBars}>
            <span className={styles.levelLabel}>Mic</span>
            <StatusIndicator
              isConnected={true}
              isTranslating={mic.isCapturing}
              engine={null}
              audioLevel={mic.audioLevel}
            />
            <span className={styles.levelLabel}>System</span>
            <StatusIndicator
              isConnected={true}
              isTranslating={system.isCapturing}
              engine={null}
              audioLevel={system.audioLevel}
            />
          </div>
          <Switch
            label={<span className={styles.switchLabel}>Auto-play audio</span>}
            checked={autoPlay}
            onChange={(_, data) => setAutoPlay(data.checked)}
          />
        </div>
      </div>
    </div>
  );
}
