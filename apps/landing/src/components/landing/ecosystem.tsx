// "An app ecosystem in a single application" (the owner, 10-15). Two pieces. The stream: every venue and provider
// Kawase actually calls, by its real mark, flowing into Kawase's own (the ones it races and the ones it pays). The
// apps: each thing you can do, as a tile with what powers it and where it runs today, the state read from the same
// capability registry the app and its agent read (`lib/capabilities.ts`), so the page can't claim more than the product
// does. A tile opens its page in the docs. GSAP's colour-as-taxonomy idea, in Kawase's one accent: magenta means live.
import {
  ArrowLeftRight,
  ArrowUpRight,
  Bot,
  BrainCircuit,
  CalendarClock,
  CreditCard,
  Flame,
  Landmark,
  LineChart,
  Mic,
  PiggyBank,
  Route,
  Send,
  ShieldCheck,
  TrendingUpDown,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NetworkId } from "@kawase/networks";
import { providerKey, venueKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-web/components/mark";

import { AREAS, ENTITY, NETWORKS, STATE_LABEL, cardState, type Area } from "@/lib/capabilities";
import { links } from "@/lib/links";

import { Reveal } from "./reveal";

/** What Kawase races and pays, by mark: swaps, bridges, yield, cards and the paid tools its agent calls. */
const STREAM = [
  providerKey("circle"),
  venueKey("cctp"),
  venueKey("uniswap"),
  venueKey("kyberswap"),
  venueKey("zerox"),
  venueKey("lifi"),
  venueKey("socket"),
  venueKey("across"),
  venueKey("relay"),
  venueKey("debridge"),
  venueKey("gaszip"),
  providerKey("aave"),
  providerKey("morpho"),
  providerKey("aero"),
  providerKey("merkl"),
  providerKey("coinbase"),
  providerKey("apple"),
  providerKey("google"),
  providerKey("quicknode"),
  providerKey("aisa"),
  providerKey("blockrun"),
  providerKey("exa"),
  providerKey("defillama"),
  providerKey("goldsky"),
];

const ICONS: Record<string, LucideIcon> = {
  "Send, receive, request": Send,
  "Trade any token": ArrowLeftRight,
  "Long and short": TrendingUpDown,
  "Meme coins": Flame,
  "Markets and every token": LineChart,
  "Buy with a card": CreditCard,
  "Withdraw anywhere": Landmark,
  "Bridges, compared": Route,
  Earn: PiggyBank,
  Borrow: Landmark,
  "Agent wallet (x402)": Bot,
  Automations: CalendarClock,
  "Memory and search": BrainCircuit,
  "Contacts and @handles": Users,
  Voice: Mic,
  "Your money without Kawase": ShieldCheck,
};

/** Marks shown on a tile, and the grid's columns for the reveal stagger. */
const TILE_MARKS = 4;
const COLUMNS = 4;
const STAGGER_S = 0.06;

const NETWORK_NAME: Record<NetworkId, string> = { mainnet: "Mainnet", testnet: "Testnet" };

function Availability({ area }: { area: Area }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium text-muted-foreground" aria-label="Where it runs">
      {NETWORKS.map((network) => {
        const state = cardState(area, network);
        return (
          <li key={network} className="inline-flex items-center gap-1.5" title={`${NETWORK_NAME[network]}: ${STATE_LABEL[state]}`}>
            <span
              aria-hidden
              className={
                state === "available"
                  ? "size-2 rounded-full bg-accent"
                  : state === "coming"
                    ? "size-2 rounded-full border border-muted-foreground"
                    : "h-px w-2 bg-muted-foreground"
              }
            />
            <span className={state === "available" ? "text-foreground" : undefined}>{NETWORK_NAME[network]}</span>
            <span className="sr-only">: {STATE_LABEL[state]}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Tile({ area }: { area: Area }) {
  const Icon = ICONS[area.title] ?? ArrowUpRight;
  return (
    <a
      href={`${links.docs}${area.docs}`}
      className="lp-tile group flex h-full flex-col gap-4 rounded-[24px] border border-border p-4 transition-[transform,border-color,box-shadow] sm:rounded-[28px] sm:p-5 duration-200 hover:-translate-y-1 hover:border-accent/50 hover:shadow-[0_18px_50px_-20px_rgba(250,0,255,0.45)] focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex size-12 items-center justify-center rounded-[14px] bg-foreground text-background">
          <Icon className="size-[22px]" aria-hidden />
        </span>
        {area.marks?.length ? (
          <span className="flex -space-x-1.5" aria-hidden>
            {area.marks.slice(0, TILE_MARKS).map((mark) => (
              <span key={mark} className="rounded-full ring-2 ring-[var(--lp-tile)]">
                <Mark entity={ENTITY[mark]} size={22} />
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <div className="flex-1">
        <h3 className="font-display text-[19px] leading-tight font-bold text-foreground sm:text-[22px]">{area.title}</h3>
        <p className="mt-1.5 hidden text-[15px] leading-[1.45] text-muted-foreground sm:block">{area.body}</p>
      </div>
      <Availability area={area} />
    </a>
  );
}

export function Ecosystem() {
  return (
    <section id="inside" className="relative scroll-mt-24 overflow-hidden py-24 sm:py-32" aria-labelledby="inside-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <p className="text-[13px] font-semibold tracking-[0.18em] text-accent uppercase">One app</p>
          <h2 id="inside-title" className="mt-4 max-w-[900px] font-display text-[clamp(40px,6vw,76px)] leading-[0.98] font-black tracking-[-0.01em] text-foreground">
            Every money app on Arc, in a single one.
          </h2>
          <p className="mt-6 max-w-[640px] text-[19px] leading-[1.5] text-[var(--lp-ink-soft)]">
            Arc has many places to swap, bridge, lend, trade and pay. Kawase works with all of them, so you don&apos;t have
            to: you ask, it compares every venue that can do it, and shows you each one by name.
          </p>
        </Reveal>
      </div>

      {/* The stream: every venue's real mark, flowing toward Kawase's. */}
      <div className="relative mt-14" aria-label="Venues and providers Kawase works with">
        <div className="lp-tape overflow-hidden py-4">
          <div className="lp-tape-track [animation-duration:45s]">
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0 items-center gap-5 pe-5" aria-hidden={copy === 1 ? true : undefined}>
                {STREAM.map((entity) => (
                  <li key={`${copy}-${entity}`} className="lp-chip flex size-16 shrink-0 items-center justify-center rounded-[20px]">
                    <Mark entity={entity} size={34} />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center" aria-hidden>
          <div className="rounded-[26px] bg-background p-2 shadow-[0_0_0_1px_var(--border),0_20px_60px_-10px_rgba(250,0,255,0.55)]">
            <Mark entity={ENTITY.kawase} size={72} />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-16 grid max-w-7xl grid-cols-2 gap-3 px-5 sm:gap-4 sm:px-8 lg:grid-cols-4">
        {AREAS.map((area, index) => (
          <Reveal key={area.title} delay={(index % COLUMNS) * STAGGER_S}>
            <Tile area={area} />
          </Reveal>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-7xl px-5 text-sm text-muted-foreground sm:px-8">
        <span className="me-1.5 inline-block size-2 rounded-full bg-accent align-middle" aria-hidden />
        Live on that network today. Read from the same registry the app and its agent use;{" "}
        <a className="underline underline-offset-4 hover:text-foreground" href={`${links.docs}/docs/availability`}>
          every network, in the docs
        </a>
        .
      </p>
    </section>
  );
}
