// The safety model in one picture: what happens to a request depending on where it falls. Every number is read from
// DEFAULT_LIMITS (packages/config/src/limits.ts), the same defaults the app and its policy engine use.
import { ArrowRight, Fingerprint, PauseCircle, ShieldCheck, Zap } from "lucide-react";
import type { ReactNode } from "react";

import { DEFAULT_LIMITS } from "@kawase/config";
import { amount, formatAmount } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

import { Section } from "@/components/section";
import { links } from "@/lib/links";

const WHOLE_DOLLARS = 0;
const money = (network: NetworkId, key: "daily" | "firstTimeRecipientApprovalThreshold") =>
  formatAmount(amount("USDC", DEFAULT_LIMITS[network][key]), "en", { fractionDigits: WHOLE_DOLLARS });

function Lane({
  icon,
  when,
  then,
  detail,
  tone,
}: {
  icon: ReactNode;
  when: string;
  then: string;
  detail: ReactNode;
  tone: "go" | "ask" | "stop";
}) {
  const ring = { go: "text-success", ask: "text-foreground", stop: "text-destructive" }[tone];
  return (
    <li className="grid gap-3 rounded-3xl border border-border bg-card p-5 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">When</p>
        <p className="mt-1 font-display text-lg font-semibold">{when}</p>
      </div>
      <ArrowRight className="hidden size-5 text-muted-foreground md:block rtl:-scale-x-100" aria-hidden />
      <div>
        <p className={`flex items-center gap-2 font-display text-lg font-semibold ${ring}`}>
          {icon}
          {then}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

export function Safety() {
  return (
    <Section
      id="safety"
      eyebrow="Safety model"
      title="It proposes. You approve. The chain enforces."
      body="Kawase's agent can only spend what you allowed it, through an on-chain allowance on your own wallet. Every request turns into a card you can read before anything moves."
    >
      <ol className="flex flex-col gap-3">
        <Lane
          tone="go"
          icon={<Zap className="size-5" aria-hidden />}
          when="Inside your daily allowance"
          then="Sent at once, no prompt"
          detail={
            <>
              Defaults: {money("mainnet", "daily")} a day on mainnet, {money("testnet", "daily")} on testnet. The cap
              lives on chain as a delegation on your wallet; a payment above it is refused by Arc itself.
            </>
          }
        />
        <Lane
          tone="ask"
          icon={<Fingerprint className="size-5" aria-hidden />}
          when="Above it, a new address, or a look-alike"
          then="You confirm with Face ID"
          detail={
            <>
              Anything over the allowance, a first payment to a new address over{" "}
              {money("mainnet", "firstTimeRecipientApprovalThreshold")} (mainnet default), a look-alike address, every
              swap and every bridge. On the web it is an email code. A voice send always waits for your tap.
            </>
          }
        />
        <Lane
          tone="stop"
          icon={<ShieldCheck className="size-5" aria-hidden />}
          when="Anything else"
          then="It can't, by construction"
          detail={
            <>
              Raising a limit takes your Face ID and a wallet signature. Revoking the agent is one ordinary
              transaction, and the agent’s next try fails on chain. Read the{" "}
              <a className="underline underline-offset-4 hover:text-foreground" href={`${links.docs}/docs/safety`}>
                safety model
              </a>{" "}
              for the full list.
            </>
          }
        />
        <Lane
          tone="ask"
          icon={<PauseCircle className="size-5" aria-hidden />}
          when="Whenever you want"
          then="You stay in control"
          detail={
            <>
              Pause all stops everything the agent does without asking. Practice mode runs the exact transaction as a
              dry run, so nothing moves. Needs you holds any step an automation may not take alone, every swap
              included. The exit kit revokes every permission in one transaction. See{" "}
              <a
                className="underline underline-offset-4 hover:text-foreground"
                href={`${links.docs}/docs/features/limits-and-control`}
              >
                limits and control
              </a>
              .
            </>
          }
        />
      </ol>
    </Section>
  );
}
