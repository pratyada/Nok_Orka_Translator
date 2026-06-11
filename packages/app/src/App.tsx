import React from "react";
import {
  makeStyles,
  tokens,
  Title2,
  Caption1,
  Badge,
} from "@fluentui/react-components";
import { TranslationPanel } from "./components/TranslationPanel";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "#f5f5f5",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 24px",
    backgroundColor: "#124191",
    color: "#ffffff",
    userSelect: "none",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  logo: {
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    backgroundColor: "rgba(255,255,255,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "20px",
    color: "#ffffff",
    letterSpacing: "-1px",
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  title: {
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: 600,
    lineHeight: "1.2",
  },
  subtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: "11px",
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    color: "#ffffff",
    fontSize: "10px",
  },
  content: {
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
});

export function App() {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>N</div>
          <div className={styles.headerText}>
            <span className={styles.title}>Orka Translator</span>
            <span className={styles.subtitle}>
              Nokia Live Meeting Translation
            </span>
          </div>
        </div>
        <Badge appearance="outline" className={styles.badge} size="medium">
          POC v0.1
        </Badge>
      </header>
      <main className={styles.content}>
        <TranslationPanel />
      </main>
    </div>
  );
}
