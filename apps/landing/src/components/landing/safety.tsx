// What keeps it safe, in three facts and one picture (10-15 rebuild; the old section quoted a daily allowance that the
// weekly budget replaced). The picture is the budget as the app draws it, with the defaults the app suggests ($200 a
// week, $50 at a time); the person picks the numbers. Every claim links to its page in the docs.
import { Hand, LockKeyhole, Power } from "lucide-react";

import { links } from "@/lib/links";

import { Reveal } from "./reveal";

const FACTS = [
  {
    icon: LockKeyhole,
    title: "A weekly budget you sign once",
    body: "Pick how much a week, how much at a time, which kinds of action and which venues. One Face ID signs it onto your own wallet; inside it, Kawase just acts.",
    href: "/docs/safety#the-everyday-allowance",
  },
  {
    icon: Hand,
    title: "Anything bigger waits for you",
    body: "Over the budget, a new address or a look-alike name: the card waits for your Face ID on the phone, or a code by email on the web. Nothing moves until you say so.",
    href: "/docs/safety#face-id-above-it",
  },
  {
    icon: Power,
    title: "Your wallet, your exit",
    body: "Pause everything in one tap. Practise any automation as a dry run first. Export your keys and use any wallet: your money never depends on Kawase.",
    href: "/docs/withdraw-without-kawase",
  },
] as const;

const RING_R = 54;
const RING_D = 108;
const RING_C = Math.PI * RING_D;
const STAGGER_S = 0.08;
/** The share of the week the picture shows spent: a third, so the ring reads as a gauge. */
const SPENT = 0.32;

function BudgetCard() {
  return (
    <div className="lp-tile rounded-[32px] border border-border p-7 shadow-[var(--lp-shadow)]">
      <p className="text-sm font-semibold text-muted-foreground">Weekly budget</p>
      <div className="mt-6 flex items-center gap-7">
        <svg viewBox="0 0 128 128" className="size-32 shrink-0 -rotate-90" aria-hidden>
          <circle cx="64" cy="64" r={RING_R} fill="none" stroke="var(--muted)" strokeWidth="12" />
          <circle cx="64" cy="64" r={RING_R} fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${RING_C * SPENT} ${RING_C}`} />
        </svg>
        <div>
          <p className="font-display text-[44px] leading-none font-black text-foreground">$64</p>
          <p className="mt-1.5 text-[15px] text-muted-foreground">of $200 this week</p>
        </div>
      </div>
      <dl className="mt-7 grid grid-cols-2 gap-3 text-[15px]">
        {[
          ["Per week", "$200"],
          ["Per action", "$50"],
          ["Sends to", "You and saved people"],
          ["Signed", "On chain, by you"],
        ].map(([term, value]) => (
          <div key={term} className="rounded-2xl bg-muted px-4 py-3">
            <dt className="text-[13px] text-muted-foreground">{term}</dt>
            <dd className="mt-0.5 font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-[13px] text-muted-foreground">An example week. You choose every number.</p>
    </div>
  );
}

export function Safety() {
  return (
    <section id="safety" className="relative scroll-mt-24 py-24 sm:py-32" aria-labelledby="safety-title">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div>
          <Reveal>
            <p className="text-[13px] font-semibold tracking-[0.18em] text-accent uppercase">Safety</p>
            <h2 id="safety-title" className="mt-4 font-display text-[clamp(40px,6vw,76px)] leading-[0.98] font-black tracking-[-0.01em] text-foreground">
              It proposes. You approve. Arc enforces.
            </h2>
          </Reveal>
          <ul className="mt-10 grid gap-4">
            {FACTS.map((fact, index) => (
              <li key={fact.title}>
                <Reveal delay={index * STAGGER_S}>
                  <a href={`${links.docs}${fact.href}`} className="group flex gap-4 rounded-[24px] p-4 transition-colors hover:bg-muted">
                    <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-foreground text-background">
                      <fact.icon className="size-5" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-display text-[22px] font-bold text-foreground">{fact.title}</span>
                      <span className="mt-1 block text-[16px] leading-[1.5] text-[var(--lp-ink-soft)]">{fact.body}</span>
                    </span>
                  </a>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
        <Reveal delay={0.1}>
          <BudgetCard />
        </Reveal>
      </div>
    </section>
  );
}
