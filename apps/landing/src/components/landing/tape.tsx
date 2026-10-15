// The tape under the hero (Mitoshi's LandingTape, Kawase's data): Trending on Arc mainnet as the app shows it, each
// token with its own logo, its price and its 24-hour move, read from the api's public market list (`GET /markets`,
// the same rows as the app's Trending) and kept a minute. It scrolls on its own and stops under the pointer; with reduced
// motion it is a row that scrolls by hand. If the api can't be read, the tape is left out rather than shown empty.
import { links } from "@/lib/links";

type Row = { token: { symbol: string; name: string; address: string; logoUrl?: string | null }; priceUsd: number | null; change24hPct: number | null };

const REVALIDATE_S = 60;
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
/** Below this a price shows its run of zeros as a count ($0.0₄6921), the way the app writes small prices. */
const SMALL = 0.001;
const DIGITS = 4;
/** Prices from a dollar up show cents. */
const CENTS = 2;
/** Enough decimals to reach the first digit of the smallest price on Arc. */
const FIXED = 18;

async function trending(): Promise<Row[]> {
  try {
    const response = await fetch(`${links.api}/markets?segment=trending&network=mainnet`, { next: { revalidate: REVALIDATE_S } });
    if (!response.ok) return [];
    const body = (await response.json()) as { market?: { rows?: Row[] } };
    return (body.market?.rows ?? []).filter((row) => row.priceUsd !== null);
  } catch {
    return [];
  }
}

export function price(value: number): string {
  if (value >= SMALL) return `$${value.toLocaleString("en-US", { maximumSignificantDigits: DIGITS, minimumFractionDigits: value >= 1 ? CENTS : 0 })}`;
  const [, fraction = ""] = value.toFixed(FIXED).split(".");
  const zeros = fraction.match(/^0*/)?.[0].length ?? 0;
  const digits = fraction.slice(zeros, zeros + DIGITS).replace(/0+$/, "");
  const count = String(zeros - 1)
    .split("")
    .map((digit) => SUBSCRIPT[Number(digit)])
    .join("");
  return `$0.0${count}${digits}`;
}

function Item({ row }: { row: Row }) {
  const change = row.change24hPct;
  const up = (change ?? 0) >= 0;
  return (
    <a
      href={`${links.webApp}/token/5042/${row.token.address}`}
      className="flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2 transition-colors hover:bg-muted"
    >
      {row.token.logoUrl ? (
        <img src={row.token.logoUrl} alt="" width={24} height={24} className="size-6 rounded-full bg-muted object-cover" loading="lazy" />
      ) : (
        <span className="size-6 rounded-full bg-muted" aria-hidden />
      )}
      <span className="text-[15px] font-semibold text-foreground">{row.token.symbol}</span>
      <span className="text-[15px] tabular-nums text-muted-foreground">{price(row.priceUsd ?? 0)}</span>
      {change !== null ? (
        <span className={`text-[13px] font-semibold tabular-nums ${up ? "text-up" : "text-down"}`}>
          {up ? "+" : ""}
          {change.toFixed(1)}%
        </span>
      ) : null}
    </a>
  );
}

export async function Tape() {
  const rows = await trending();
  if (rows.length === 0) return null;
  return (
    <section aria-label="Trending on Arc" className="border-y border-border bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 sm:px-8">
        <span className="hidden shrink-0 items-center gap-2 py-3 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase sm:flex">
          <span className="lp-live" aria-hidden /> Trending on Arc
        </span>
        <div className="lp-tape min-w-0 flex-1 overflow-hidden py-2">
          <div className="lp-tape-track">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex" aria-hidden={copy === 1 ? true : undefined}>
                {rows.map((row) => (
                  <Item key={`${copy}-${row.token.address}`} row={row} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
