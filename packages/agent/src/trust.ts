// Whose words a step follows (H2): the person's own message, or something the model read. Inside the allowance a send
// goes without a tap only when the person named its recipient themselves (the address, @handle or contact name,
// compared as they read it) and nothing written outside Kawase reached the model since their message: a seller's
// answer, a token's or vault's name, a memo, a payment code's note, a past conversation. Otherwise the send waits on
// its card for their tap; it is never refused for this. remember_fact follows the same rule, so outside text cannot
// plant "Mum is @mallory" for later sends. On a turn that continues a card (a tool's output or an approval from the
// device) the person wrote nothing new, so nothing counts as typed.
import type { SendHold } from "@kawase/api-client";

/** Characters that show nothing on screen: soft hyphen, zero-width spaces and joiners, direction marks, the BOM. */
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
/** Scripts written without spaces between words: a name inside a sentence there has no word boundary to find. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const WORD_CHAR = "[\\p{L}\\p{M}\\p{N}_]";
/** An @handle inside a sentence (handles are a–z, 0–9 and _). */
const HANDLE_IN_TEXT = /@[a-z0-9_]+/gi;

export const ADDRESS_NOT_TYPED = "An address must be typed by the person; ask them for it.";

/** Text as a person reads it: compatibility forms folded (fullwidth letters, ligatures), invisible characters dropped, case and spacing ignored. */
export function asRead(text: string): string {
  return text.normalize("NFKC").replace(INVISIBLE, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether `words` (an 0x address, an @handle or a name) is in `message` as whole words: "@alex" is not in "@alexander",
 * and "@alex" is not in "alex" (a handle the person did not write as one may be someone else).
 */
export function named(message: string, words: string): boolean {
  const wanted = asRead(words);
  if (!wanted) return false;
  const chars = [...wanted];
  const opens = UNSPACED.test(chars[0]!) ? "" : `(?<!${WORD_CHAR})`;
  const closes = UNSPACED.test(chars.at(-1)!) ? "" : `(?!${WORD_CHAR})`;
  return new RegExp(`${opens}${escape(wanted)}${closes}`, "u").test(asRead(message));
}

/** K2: an 0x address the model passes must be one the person typed, never one from a tool's result or the model. */
export function addressTyped(message: string, words: string): boolean {
  return !/^0x/i.test(words.trim()) || named(message, words);
}

/** The @handles a sentence names. */
export const handlesIn = (text: string) => text.match(HANDLE_IN_TEXT) ?? [];

/** Why a step waits for the person's tap instead of going at once (the card says which). */
export type Hold = SendHold;

/** One turn's account of what the person typed and what outside text the model read since. */
export type TurnTrust = {
  /** Records outside text the model read (the tool's source, e.g. "x402 seller"). */
  read(source: string): void;
  /** Where the outside text read since the person's message came from; empty when there was none. */
  readonly outside: readonly string[];
  /** Whether the person's own message names `words`. */
  typed(words: string): boolean;
  /** Why acting for `recipient` must wait for the person's tap; null when it may go as they asked. */
  hold(recipient: string): Hold | null;
};

export function turnTrust(personSaid: string): TurnTrust {
  const outside: string[] = [];
  return {
    read(source) {
      if (!outside.includes(source)) outside.push(source);
    },
    get outside() {
      return outside;
    },
    typed: (words) => named(personSaid, words),
    hold: (recipient) => (!named(personSaid, recipient) ? "not_typed" : outside.length > 0 ? "outside_text" : null),
  };
}
