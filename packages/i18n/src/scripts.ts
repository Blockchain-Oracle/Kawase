/**
 * Writing systems with no capital letters, where letter-spacing must not be used: spacing the letters of a
 * joined script (Arabic, Devanagari, Bengali) breaks the word, and Chinese and Japanese are not spaced either.
 * Ranges are Unicode blocks.
 */
const UNCASED_SCRIPT_BLOCKS = {
  arabic: { from: 0x0600, to: 0x06ff },
  arabicSupplement: { from: 0x0750, to: 0x077f },
  arabicExtendedA: { from: 0x08a0, to: 0x08ff },
  arabicPresentationFormsA: { from: 0xfb50, to: 0xfdff },
  arabicPresentationFormsB: { from: 0xfe70, to: 0xfeff },
  devanagariAndBengali: { from: 0x0900, to: 0x09ff },
  kana: { from: 0x3040, to: 0x30ff },
  cjkExtensionA: { from: 0x3400, to: 0x4dbf },
  cjkUnified: { from: 0x4e00, to: 0x9fff },
} as const;

const BLOCKS = Object.values(UNCASED_SCRIPT_BLOCKS);

/** True when the text contains Arabic, Urdu, Hindi, Bengali, Chinese or Japanese characters. */
export function hasUncasedScript(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (BLOCKS.some((block) => code >= block.from && code <= block.to)) return true;
  }
  return false;
}
