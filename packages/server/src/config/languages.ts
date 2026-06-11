import { SUPPORTED_LANGUAGES, type LanguageCode } from "@orka/shared";

export function getLanguageName(code: LanguageCode): string {
  return SUPPORTED_LANGUAGES[code].name;
}

export function getBcp47(code: LanguageCode): string {
  return SUPPORTED_LANGUAGES[code].bcp47;
}

export function buildTranslationPrompt(
  source: LanguageCode,
  target: LanguageCode,
): string {
  const sourceName = getLanguageName(source);
  const targetName = getLanguageName(target);

  return `You are a professional real-time translator for Nokia business meetings. Translate the following text from ${sourceName} to ${targetName}.

Rules:
- Preserve Nokia-specific terminology (e.g., product names, technical terms) without translation
- Maintain the speaker's tone and intent
- Keep translations concise and natural-sounding
- If the text contains telecom jargon, use the standard ${targetName} equivalent
- Do not add explanations — output only the translation

Text to translate:`;
}
