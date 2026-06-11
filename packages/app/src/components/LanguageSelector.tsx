import React from "react";
import {
  Dropdown,
  Option,
  makeStyles,
  tokens,
  Button,
} from "@fluentui/react-components";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@orka/shared";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  label: {
    fontSize: "12px",
    fontWeight: 600,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  dropdown: {
    minWidth: "140px",
  },
  swap: {
    minWidth: "32px",
    padding: "4px",
    fontSize: "16px",
  },
});

interface LanguageSelectorProps {
  source: LanguageCode;
  target: LanguageCode;
  onSourceChange: (lang: LanguageCode) => void;
  onTargetChange: (lang: LanguageCode) => void;
  disabled?: boolean;
  sourceLabel?: string;
  targetLabel?: string;
}

const languageOptions = Object.entries(SUPPORTED_LANGUAGES).map(
  ([code, { name }]) => ({
    code: code as LanguageCode,
    name,
  }),
);

export function LanguageSelector({
  source,
  target,
  onSourceChange,
  onTargetChange,
  disabled,
  sourceLabel = "From",
  targetLabel = "To",
}: LanguageSelectorProps) {
  const styles = useStyles();

  const handleSwap = () => {
    onSourceChange(target);
    onTargetChange(source);
  };

  return (
    <div className={styles.root}>
      <span className={styles.label}>{sourceLabel}</span>
      <Dropdown
        className={styles.dropdown}
        value={SUPPORTED_LANGUAGES[source].name}
        selectedOptions={[source]}
        onOptionSelect={(_, data) =>
          onSourceChange(data.optionValue as LanguageCode)
        }
        disabled={disabled}
        size="medium"
      >
        {languageOptions.map((lang) => (
          <Option key={lang.code} value={lang.code}>
            {lang.name}
          </Option>
        ))}
      </Dropdown>

      <Button
        appearance="subtle"
        className={styles.swap}
        onClick={handleSwap}
        disabled={disabled}
        title="Swap languages"
      >
        &#8644;
      </Button>

      <span className={styles.label}>{targetLabel}</span>
      <Dropdown
        className={styles.dropdown}
        value={SUPPORTED_LANGUAGES[target].name}
        selectedOptions={[target]}
        onOptionSelect={(_, data) =>
          onTargetChange(data.optionValue as LanguageCode)
        }
        disabled={disabled}
        size="medium"
      >
        {languageOptions.filter((l) => l.code !== source).map((lang) => (
          <Option key={lang.code} value={lang.code}>
            {lang.name}
          </Option>
        ))}
      </Dropdown>
    </div>
  );
}
