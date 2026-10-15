"use client";

// The tour: one phone held in place while the steps scroll past it (Bevel's feature walk and GSAP's pinned scroll, built
// on `motion` rather than a scroll-jacking library: the page scrolls normally, the phone is `position: sticky`). Each
// step brings its real screen in with a crossfade and turns the phone a few degrees in 3D, so the page reads as one
// device being used. On a phone each step carries its own screen inline. Reduced motion: no turn, a plain swap.
import { motion, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Phone, Shot, type PhoneScreen } from "./devices";

type Step = { screen: PhoneScreen; kicker: string; title: string; body: string; alt: string };

const STEPS: readonly Step[] = [
  {
    screen: "home",
    kicker: "01 · Ask",
    title: "Say it the way you'd say it.",
    body: "Type or talk, in any of ten languages. “Bring my USDC from Base.” “Long cirBTC, twice.” “Pay Ade 20 euros on Friday.” Kawase works out the rest.",
    alt: "Kawase Home: Trending on Arc with live sparklines, and the composer that says Tell Kawase what to do",
  },
  {
    screen: "welcome",
    kicker: "02 · It races",
    title: "Every route, raced. The best one, picked.",
    body: "It asks every venue that can do the job at once, Circle, Uniswap, KyberSwap, LI.FI, Across, Relay and more, and takes the one that delivers most. You see each answer by name.",
    alt: "A Kawase run: checked five routes, picked the best one, arrived on Arc with 4.98 USDC",
  },
  {
    screen: "token",
    kicker: "03 · Trade",
    title: "Any token on Arc, live.",
    body: "A page for every token, with a chart that moves on each trade, the stats that matter, and BasedBot, DexScreener and ArcScan one tap away. Buy or sell in one slide.",
    alt: "Malachite on Kawase: a live price chart, market cap, liquidity and holders, with Buy and Sell",
  },
  {
    screen: "margin",
    kicker: "04 · Long or short",
    title: "Leverage, through your own account.",
    body: "Long or short Arc's majors on Aave V4, opened as one transaction from your wallet, with the liquidation price shown before you slide.",
    alt: "Kawase Long / Short: cirBTC at $82,223 with its chart, and Long and Short buttons",
  },
  {
    screen: "marketplace",
    kicker: "05 · Pay for answers",
    title: "Your agent can buy what it needs.",
    body: "84 paid tools on x402, data, search and research, paid per call from the agent's own wallet, inside a daily budget you set.",
    alt: "The Kawase Marketplace: paid tools with their prices per call in USDC",
  },
];

/** Degrees the phone turns, alternating, as each step lands. */
const TURN = 9;
const SPRING = { stiffness: 90, damping: 18 };
/** The phone turns one way on even steps and the other on odd ones. */
const ALTERNATE = 2;
/** The first screens load with the page; the rest as they are reached. */
const EAGER_SCREENS = 2;

export function Tour() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const turn = useSpring(-TURN, SPRING);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.step);
          setActive(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const node of refs.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    turn.set(reduced ? 0 : active % ALTERNATE === 0 ? -TURN : TURN);
  }, [active, reduced, turn]);

  return (
    <section id="tour" className="relative scroll-mt-24 py-24 sm:py-32" aria-labelledby="tour-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <p className="text-[13px] font-semibold tracking-[0.18em] text-accent uppercase">How it works</p>
        <h2 id="tour-title" className="mt-4 max-w-[860px] font-display text-[clamp(40px,6vw,76px)] leading-[0.98] font-black tracking-[-0.01em] text-foreground">
          Ask. It races. It&apos;s done.
        </h2>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <ol className="flex flex-col">
            {STEPS.map((step, index) => (
              <li
                key={step.screen}
                ref={(node) => {
                  refs.current[index] = node;
                }}
                data-step={index}
                className="flex flex-col justify-center gap-6 py-10 lg:min-h-[78vh] lg:py-0"
              >
                <div className={`transition-opacity duration-500 lg:max-w-[520px] ${active === index ? "lg:opacity-100" : "lg:opacity-35"}`}>
                  <p className="font-mono text-[13px] font-semibold tracking-wide text-accent">{step.kicker}</p>
                  <h3 className="mt-3 font-display text-[clamp(30px,3.6vw,46px)] leading-[1.02] font-black text-foreground">{step.title}</h3>
                  <p className="mt-4 text-[18px] leading-[1.55] text-[var(--lp-ink-soft)]">{step.body}</p>
                </div>
                {/* A phone of its own for each step, where the pinned one doesn't fit. */}
                <div className="flex justify-center lg:hidden">
                  <Phone className="[--phone-w:min(70vw,280px)]">
                    <Shot name={step.screen} alt={step.alt} />
                  </Phone>
                </div>
              </li>
            ))}
          </ol>

          <div className="relative hidden lg:block">
            <div className="sticky top-[12vh] flex h-[76vh] items-center justify-center [perspective:1600px]">
              <div className="pointer-events-none absolute inset-0 rounded-[48px] lp-glow opacity-90" aria-hidden />
              <motion.div style={{ rotateY: turn }} className="relative">
                <Phone className="[--phone-w:min(30vw,330px)]" label={STEPS[active]?.alt}>
                  {STEPS.map((step, index) => (
                    <div
                      key={step.screen}
                      className="absolute inset-0 transition-opacity duration-500"
                      style={{ opacity: index === active ? 1 : 0 }}
                      aria-hidden={index !== active}
                    >
                      <Shot name={step.screen} alt="" eager={index < EAGER_SCREENS} />
                    </div>
                  ))}
                </Phone>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
