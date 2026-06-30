export const SUPPORTED_LANGUAGES = {
  en: { name: "English (US)", bcp47: "en-US" },
  "en-GB": { name: "English (UK)", bcp47: "en-GB" },
  "en-IN": { name: "English (India)", bcp47: "en-IN" },
  "en-AU": { name: "English (Australia)", bcp47: "en-AU" },
  "en-CA": { name: "English (Canada)", bcp47: "en-CA" },
  "en-clear": { name: "English (Clear / Accent-Free)", bcp47: "en-US" },
  es: { name: "Spanish", bcp47: "es-ES" },
  fr: { name: "French", bcp47: "fr-FR" },
  pt: { name: "Portuguese", bcp47: "pt-BR" },
  de: { name: "German", bcp47: "de-DE" },
  it: { name: "Italian", bcp47: "it-IT" },
  nl: { name: "Dutch", bcp47: "nl-NL" },
  zh: { name: "Chinese", bcp47: "zh-CN" },
  ja: { name: "Japanese", bcp47: "ja-JP" },
  ko: { name: "Korean", bcp47: "ko-KR" },
  hi: { name: "Hindi", bcp47: "hi-IN" },
  ar: { name: "Arabic", bcp47: "ar-SA" },
  ru: { name: "Russian", bcp47: "ru-RU" },
  tr: { name: "Turkish", bcp47: "tr-TR" },
  pl: { name: "Polish", bcp47: "pl-PL" },
  sv: { name: "Swedish", bcp47: "sv-SE" },
  fi: { name: "Finnish", bcp47: "fi-FI" },
  da: { name: "Danish", bcp47: "da-DK" },
  nb: { name: "Norwegian", bcp47: "nb-NO" },
  th: { name: "Thai", bcp47: "th-TH" },
  vi: { name: "Vietnamese", bcp47: "vi-VN" },
  id: { name: "Indonesian", bcp47: "id-ID" },
  ms: { name: "Malay", bcp47: "ms-MY" },
  tl: { name: "Filipino", bcp47: "tl-PH" },
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

export interface LanguagePair {
  source: LanguageCode;
  target: LanguageCode;
}

export function isValidLanguage(code: string): code is LanguageCode {
  return code in SUPPORTED_LANGUAGES;
}
