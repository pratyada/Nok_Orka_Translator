import React from "react";
import {
  makeStyles,
  tokens,
} from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  dotDisconnected: {
    backgroundColor: "#d13438",
  },
  dotReady: {
    backgroundColor: "#0078d4",
  },
  dotActive: {
    backgroundColor: "#107c10",
    boxShadow: "0 0 6px rgba(16,124,16,0.5)",
  },
  label: {
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
  },
  audioLevel: {
    width: "80px",
    height: "4px",
    backgroundColor: "#e8e8e8",
    borderRadius: "2px",
    overflow: "hidden",
  },
  audioLevelFill: {
    height: "100%",
    backgroundColor: "#107c10",
    borderRadius: "2px",
    transition: "width 80ms ease",
  },
  engineBadge: {
    fontSize: "10px",
    padding: "1px 6px",
    borderRadius: "8px",
    backgroundColor: "#e8f5e9",
    color: "#107c10",
  },
});

interface StatusIndicatorProps {
  isConnected: boolean;
  isTranslating: boolean;
  engine: "realtime" | "fallback" | null;
  audioLevel: number;
}

export function StatusIndicator({
  isConnected,
  isTranslating,
  engine,
  audioLevel,
}: StatusIndicatorProps) {
  const styles = useStyles();

  const dotClass = !isConnected
    ? styles.dotDisconnected
    : isTranslating
      ? styles.dotActive
      : styles.dotReady;

  const label = !isConnected
    ? "Disconnected"
    : isTranslating
      ? "Translating"
      : "Ready";

  return (
    <div className={styles.root}>
      <div className={`${styles.dot} ${dotClass}`} />
      <span className={styles.label}>{label}</span>
      {isTranslating && engine && (
        <span className={styles.engineBadge}>{engine}</span>
      )}
      {isTranslating && (
        <div className={styles.audioLevel}>
          <div
            className={styles.audioLevelFill}
            style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
