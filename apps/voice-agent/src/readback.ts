// The readback guard (plan §1.4): GPT-Live paraphrases what Kawase tells it, so before trusting what was said aloud we
// compare its numbers, assets, @handles and network against the canonical facts of the turn (Kawase's own line and the
// tool summaries the agent saw). A mismatch gets a spoken correction. The card stays the authority either way: money
// only moves when the person taps it.
import type { Card } from "./turn";

export type Facts = {
  numbers: Set<string>;
  assets: Set<string>;
  handles: Set<string>;
  networks: Set<"mainnet" | "testnet">;
};

/** Tickers the guard knows; a spoken ticker outside the facts is a mismatch. */
const TICKERS = ["USDC", "EURC", "USYC", "WETH", "ETH", "CIRBTC", "BTC", "XAUM"] as const;
const TICKER_PATTERN = new RegExp(`\\b(${TICKERS.join("|")})\\b`, "gi");
const HANDLE_PATTERN = /@[a-z0-9_]{3,20}/gi;
const NUMBER_PATTERN = /\d[\d.,\u00a0\u202f ]*\d|\d/g;
/** Words and signs that make a number an amount (the guard ignores times, counts and dates). */
const CURRENCY_CUES = [
  "$",
  "€",
  "usdc",
  "eurc",
  "dollar",
  "euro",
  "dólar",
  "dolar",
  "доллар",
  "евро",
  "美元",
  "欧元",
  "डॉलर",
  "यूरो",
  "ডলার",
  "ইউরো",
  "دولار",
  "يورو",
  "ڈالر",
  "یورو",
];
/** How many characters around a number are searched for a currency cue. */
const CUE_WINDOW_CHARS = 24;
const DECIMAL_DIGITS_MAX = 2;
/** "1.234.567" has more than two dot-separated parts: the dots group thousands. */
const SINGLE_DECIMAL_PARTS = 2;

/** "1,234.50" / "1 234,5" / "10.00" → "1234.5" / "1234.5" / "10". */
export function normalizeNumber(raw: string): string | undefined {
  const compact = raw.replace(/[\u00a0\u202f ]/g, "");
  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  let canonical: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    canonical = compact.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    const tail = compact.length - lastComma - 1;
    canonical = tail > 0 && tail <= DECIMAL_DIGITS_MAX ? compact.replace(",", ".") : compact.split(",").join("");
  } else if (lastDot >= 0 && compact.split(".").length > SINGLE_DECIMAL_PARTS) {
    canonical = compact.split(".").join("");
  } else {
    canonical = compact;
  }
  const value = Number(canonical);
  return Number.isFinite(value) ? String(value) : undefined;
}

function amountNumbers(text: string, requireCue: boolean): Set<string> {
  const out = new Set<string>();
  const lower = text.toLowerCase();
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const start = match.index ?? 0;
    const window = lower.slice(Math.max(0, start - CUE_WINDOW_CHARS), start + match[0].length + CUE_WINDOW_CHARS);
    if (requireCue && !CURRENCY_CUES.some((cue) => window.includes(cue))) continue;
    const normalized = normalizeNumber(match[0]);
    if (normalized) out.add(normalized);
  }
  return out;
}

const networksIn = (text: string) => {
  const lower = text.toLowerCase();
  const out = new Set<"mainnet" | "testnet">();
  if (lower.includes("testnet")) out.add("testnet");
  if (lower.includes("mainnet")) out.add("mainnet");
  return out;
};

/** Everything the turn established: every number counts here (canonical text is exact by construction). */
export function factsOf(text: string): Facts {
  return {
    numbers: amountNumbers(text, false),
    assets: new Set([...text.matchAll(TICKER_PATTERN)].map((match) => match[1]!.toUpperCase())),
    handles: new Set([...text.matchAll(HANDLE_PATTERN)].map((match) => match[0].toLowerCase())),
    networks: networksIn(text),
  };
}

/** What was said aloud that the facts don't support: amounts, assets, @handles, or the wrong network. */
export function readbackProblems(spoken: string, facts: Facts): string[] {
  const problems: string[] = [];
  for (const number of amountNumbers(spoken, true))
    if (!facts.numbers.has(number)) problems.push(`amount ${number} not in the facts`);
  for (const match of spoken.matchAll(TICKER_PATTERN)) {
    const asset = match[1]!.toUpperCase();
    if (!facts.assets.has(asset)) problems.push(`asset ${asset} not in the facts`);
  }
  for (const match of spoken.matchAll(HANDLE_PATTERN)) {
    const handle = match[0].toLowerCase();
    if (!facts.handles.has(handle)) problems.push(`recipient ${handle} not in the facts`);
  }
  for (const network of networksIn(spoken))
    if (facts.networks.size > 0 && !facts.networks.has(network)) problems.push(`network ${network} not in the facts`);
  return [...new Set(problems)];
}

/** The canonical facts of a turn: the plain summaries the agent itself saw for each tool it used. */
export function canonicalFacts(cards: Card[]): string {
  return cards
    .map((card) => {
      const summary = (card.output as { summary?: unknown } | undefined)?.summary;
      if (summary === undefined || summary === null) return "";
      return `${card.toolName}: ${typeof summary === "string" ? summary : JSON.stringify(summary)}`;
    })
    .filter(Boolean)
    .join("\n");
}
