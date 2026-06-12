import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Dropdown,
  Option,
  makeStyles,
  tokens,
  Switch,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@orka/shared";
import { useListenerSocket, type Turn } from "../hooks/useTranslationSocket";
import { useAudioCapture } from "../hooks/useAudioCapture";
import { AudioPlayer } from "../services/audio-player";
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
  langGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  langLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  langDropdown: {
    minWidth: "180px",
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
  transcriptPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    overflow: "hidden",
    minHeight: 0,
  },
  transcriptHeader: {
    padding: "10px 16px",
    borderBottom: "1px solid #eee",
    fontSize: "12px",
    fontWeight: 700,
    color: "#124191",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backgroundColor: "#f9fafd",
  },
  transcriptBody: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 16px",
  },
  turn: {
    marginBottom: "16px",
    paddingBottom: "12px",
    borderBottom: "1px dashed #e6e8ec",
  },
  turnOriginal: {
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
    fontStyle: "italic",
    marginBottom: "4px",
    whiteSpace: "pre-wrap",
  },
  turnTranslated: {
    fontSize: "15px",
    color: "#1a1a1a",
    lineHeight: "1.5",
    whiteSpace: "pre-wrap",
  },
  turnSkipped: {
    fontSize: "13px",
    color: tokens.colorNeutralForeground4,
    fontStyle: "italic",
  },
  placeholder: {
    color: tokens.colorNeutralForeground4,
    fontStyle: "italic",
    fontSize: "13px",
    textAlign: "center",
    padding: "24px",
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
  levelLabel: {
    fontSize: "10px",
    color: tokens.colorNeutralForeground3,
  },
});

const LANGUAGE_OPTIONS = Object.entries(SUPPORTED_LANGUAGES).map(
  ([code, { name }]) => ({ code: code as LanguageCode, name }),
);

export function TranslationPanel() {
  const styles = useStyles();
  const [target, setTarget] = useState<LanguageCode>("en");
  const [autoPlay, setAutoPlay] = useState(true);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const handleTranslatedAudio = useCallback(
    (_turnId: string, pcmData: ArrayBuffer) => {
      if (!autoPlay) return;
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new AudioPlayer();
      }
      audioPlayerRef.current.resume();
      audioPlayerRef.current.enqueue(pcmData);
    },
    [autoPlay],
  );

  const listener = useListenerSocket({
    onTranslatedAudio: handleTranslatedAudio,
  });

  const isActiveRef = useRef(false);
  isActiveRef.current = listener.isActive;

  // System audio capture, with feedback-loop suppression while our own
  // translated audio is playing through the same render endpoint.
  const system = useAudioCapture(
    useCallback(
      (chunk: ArrayBuffer) => {
        if (isActiveRef.current) {
          listener.sendAudio(chunk);
        }
      },
      [listener.sendAudio],
    ),
    useCallback(() => !!audioPlayerRef.current?.playing, []),
  );

  const handleStart = useCallback(async () => {
    listener.startListening(target);
    try {
      await system.start("system");
    } catch (err) {
      console.error("[orka] System audio capture failed", err);
    }
  }, [target, listener, system]);

  const handleStop = useCallback(() => {
    system.stop();
    listener.stopListening();
    audioPlayerRef.current?.stop();
  }, [system, listener]);

  // Auto-scroll transcript to bottom as new turns arrive
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [listener.turns]);

  const error = system.error || listener.error;
  const targetName = SUPPORTED_LANGUAGES[target].name;

  return (
    <div className={styles.root}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.controlBar}>
        <div className={styles.langGroup}>
          <span className={styles.langLabel}>I want to hear in</span>
          <Dropdown
            className={styles.langDropdown}
            value={targetName}
            selectedOptions={[target]}
            onOptionSelect={(_, data) =>
              setTarget(data.optionValue as LanguageCode)
            }
            disabled={listener.isActive}
            size="medium"
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <Option key={lang.code} value={lang.code}>
                {lang.name}
              </Option>
            ))}
          </Dropdown>
        </div>

        {!listener.isActive ? (
          <Button
            appearance="primary"
            size="large"
            className={styles.startBtn}
            onClick={handleStart}
            disabled={!listener.isConnected}
          >
            Start Listening
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

      <div className={styles.transcriptPane}>
        <div className={styles.transcriptHeader}>
          Meeting transcript &mdash; everything translated to {targetName}
        </div>
        <div className={styles.transcriptBody} ref={transcriptRef}>
          {listener.turns.length === 0 ? (
            <div className={styles.placeholder}>
              {listener.isActive
                ? "Listening for speech in the meeting..."
                : "Click \"Start Listening\" to begin translating meeting audio."}
            </div>
          ) : (
            listener.turns.map((turn) => <TurnRow key={turn.turnId} turn={turn} />)
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <StatusIndicator
          isConnected={listener.isConnected}
          isTranslating={listener.isActive}
          engine="realtime"
          audioLevel={system.audioLevel}
        />
        <div className={styles.footerRight}>
          <span className={styles.levelLabel}>System audio</span>
          <StatusIndicator
            isConnected={true}
            isTranslating={system.isCapturing}
            engine={null}
            audioLevel={system.audioLevel}
          />
          <Switch
            label={<span className={styles.switchLabel}>Auto-play translation</span>}
            checked={autoPlay}
            onChange={(_, data) => setAutoPlay(data.checked)}
          />
        </div>
      </div>
    </div>
  );
}

function TurnRow({ turn }: { turn: Turn }) {
  const styles = useStyles();
  return (
    <div className={styles.turn}>
      {turn.originalText && (
        <div className={styles.turnOriginal}>&ldquo;{turn.originalText}&rdquo;</div>
      )}
      {turn.skipped ? (
        <div className={styles.turnSkipped}>
          (already in your language &mdash; no translation needed)
        </div>
      ) : (
        <div className={styles.turnTranslated}>
          {turn.translatedText || (
            <span className={styles.turnSkipped}>translating&hellip;</span>
          )}
        </div>
      )}
    </div>
  );
}
