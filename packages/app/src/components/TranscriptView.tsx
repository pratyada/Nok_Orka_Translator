import React, { useEffect, useRef } from "react";
import {
  makeStyles,
  tokens,
  Text,
} from "@fluentui/react-components";

const useStyles = makeStyles({
  root: {
    display: "flex",
    gap: "12px",
    flex: 1,
    minHeight: 0,
  },
  pane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  paneHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottom: "1px solid #eee",
  },
  paneHeaderOriginal: {
    backgroundColor: "#f8f9fa",
  },
  paneHeaderTranslated: {
    backgroundColor: "#f0f7ff",
  },
  paneLabel: {
    fontSize: "13px",
    fontWeight: 600,
    color: tokens.colorNeutralForeground2,
  },
  paneLabelTranslated: {
    color: "#124191",
  },
  paneTag: {
    fontSize: "10px",
    padding: "2px 8px",
    borderRadius: "10px",
    backgroundColor: "rgba(0,0,0,0.05)",
    color: tokens.colorNeutralForeground3,
  },
  paneContent: {
    flex: 1,
    padding: "16px",
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: "15px",
    lineHeight: "1.7",
    color: tokens.colorNeutralForeground1,
  },
  placeholder: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: tokens.colorNeutralForeground4,
    fontStyle: "italic",
    fontSize: "14px",
    textAlign: "center",
    padding: "20px",
  },
  activeIndicator: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#107c10",
    animation: "pulse 1.5s infinite",
  },
});

interface TranscriptViewProps {
  originalText: string;
  translatedText: string;
  sourceLabel: string;
  targetLabel: string;
  isActive: boolean;
}

export function TranscriptView({
  originalText,
  translatedText,
  sourceLabel,
  targetLabel,
  isActive,
}: TranscriptViewProps) {
  const styles = useStyles();
  const originalRef = useRef<HTMLDivElement>(null);
  const translatedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (originalRef.current) {
      originalRef.current.scrollTop = originalRef.current.scrollHeight;
    }
  }, [originalText]);

  useEffect(() => {
    if (translatedRef.current) {
      translatedRef.current.scrollTop = translatedRef.current.scrollHeight;
    }
  }, [translatedText]);

  return (
    <div className={styles.root}>
      <div className={styles.pane}>
        <div className={`${styles.paneHeader} ${styles.paneHeaderOriginal}`}>
          <span className={styles.paneLabel}>{sourceLabel}</span>
          <span className={styles.paneTag}>Original</span>
        </div>
        <div className={styles.paneContent} ref={originalRef}>
          {originalText || (
            <div className={styles.placeholder}>
              {isActive
                ? "Listening... speak now"
                : "Click 'Start Translating' and speak"}
            </div>
          )}
        </div>
      </div>

      <div className={styles.pane}>
        <div className={`${styles.paneHeader} ${styles.paneHeaderTranslated}`}>
          <span className={`${styles.paneLabel} ${styles.paneLabelTranslated}`}>
            {targetLabel}
          </span>
          <span className={styles.paneTag}>Translation</span>
        </div>
        <div className={styles.paneContent} ref={translatedRef}>
          {translatedText || (
            <div className={styles.placeholder}>
              {isActive
                ? "Translation will appear here..."
                : "Translated text appears here"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
