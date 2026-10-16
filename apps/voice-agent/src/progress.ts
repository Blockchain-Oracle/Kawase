import type { Card } from "./turn";

const STABLE = new Set(["USDC", "EURC"]);
const DECIMAL = /^\d+(?:\.\d{1,18})?$/;
const ATOMIC = /^\d{1,40}$/;
const MAX_DECIMALS = 18;
const MAX_INPUT_LENGTH = 30;
const TEN = 10n;
const HUNDRED = 100n;
const HALF = 2n;
const ZERO = 0n;
const CENT_DIGITS = 2;

function displayAmount(raw: unknown, decimals: unknown): string | undefined {
  if (typeof raw !== "string" || !ATOMIC.test(raw) || !Number.isInteger(decimals) || (decimals as number) < 0 || (decimals as number) > MAX_DECIMALS)
    return undefined;
  const places = decimals as number;
  const padded = BigInt(raw).toString().padStart(places + 1, "0");
  if (places === 0) return padded;
  const fraction = padded.slice(-places).replace(/0+$/, "");
  return fraction ? `${padded.slice(0, -places)}.${fraction}` : padded.slice(0, -places);
}

function spokenEstimate(raw: string, decimals: number): string {
  const atoms = BigInt(raw);
  const unit = TEN ** BigInt(decimals);
  const cents = (atoms * HUNDRED + unit / HALF) / unit;
  if (cents === ZERO && atoms > ZERO) return displayAmount(raw, decimals)!;
  const whole = cents / HUNDRED;
  const fraction = String(cents % HUNDRED).padStart(CENT_DIGITS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** One provisional, source-backed update, only for a finished USDC/EURC route comparison. */
export function routeProgress(card: Card, natural = false): string | undefined {
  if (card.toolName !== "race_routes" || !card.output || typeof card.output !== "object") return undefined;
  const output = card.output as {
    status?: unknown;
    request?: { kind?: unknown; from?: unknown; to?: unknown; amount?: unknown };
    race?: { best?: unknown; rows?: unknown };
  };
  const { request, race } = output;
  if (output.status !== "done" || request?.kind !== "swap" || !STABLE.has(String(request.from)) || !STABLE.has(String(request.to)) || request.from === request.to)
    return undefined;
  if (typeof request.amount !== "string" || request.amount.length > MAX_INPUT_LENGTH || !DECIMAL.test(request.amount) || !Array.isArray(race?.rows) || typeof race.best !== "string")
    return undefined;
  const row = race.rows.find((item: unknown) => item && typeof item === "object" && (item as { venue?: unknown }).venue === race.best) as
    | { status?: unknown; executable?: unknown; receive?: { amount?: unknown; decimals?: unknown; symbol?: unknown } }
    | undefined;
  const quote = row?.receive;
  if (row?.status !== "quoted" || row.executable !== true || !quote || quote.symbol !== request.to) return undefined;
  const received = displayAmount(quote.amount, quote.decimals);
  if (!received) return undefined;
  if (natural)
    return `For ${request.amount} ${request.from}, the early estimate is about ${spokenEstimate(quote.amount as string, quote.decimals as number)} ${request.to}. It can change before the swap is ready.`;
  return `The route comparison estimates about ${received} ${request.to} for ${request.amount} ${request.from}. I'm checking the final quote; it may change.`;
}
