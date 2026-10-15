// Registry-driven blocks for MDX pages. Everything here is computed when the site is built from @kawase/config, the
// same registry the app and the agent read, so the docs cannot claim more than the product does.
import { DEFAULT_LIMITS, type CapabilityState } from "@kawase/config";
import { amount, formatAmount } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

import { AREAS, NETWORK_ORDER, areaLabel, areaState, scopeOf, type AreaId } from "@/lib/product";
import { getMessages, translateScope, type Messages } from "@/lib/messages";
import { StateChip } from "./state-chip";

const stateLabel = (t: Messages, state: CapabilityState) => t.state[state];
const networkLabel = (t: Messages, network: NetworkId) => (network === "mainnet" ? t.matrix.mainnet : t.matrix.testnet);

export function AvailabilityMatrix({ lang }: { lang: string }) {
  const t = getMessages(lang);
  return (
    <figure className="not-prose my-6">
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="px-4 py-3 text-start font-semibold">
                {t.matrix.capability}
              </th>
              {NETWORK_ORDER.map((network) => (
                <th key={network} scope="col" className="px-4 py-3 text-start font-semibold">
                  {networkLabel(t, network)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AREAS.map((id) => (
              <tr key={id} className="border-t border-border">
                <th scope="row" className="px-4 py-2.5 text-start font-medium">
                  {areaLabel(id, lang)}
                </th>
                {NETWORK_ORDER.map((network) => {
                  const state = areaState(id, network);
                  return (
                    <td key={network} className="px-4 py-2.5">
                      <StateChip state={state} label={stateLabel(t, state)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">{t.matrix.caption}</figcaption>
    </figure>
  );
}

/** One capability's state on both networks, for the top of a feature page. */
export function Status({ lang, ids }: { lang: string; ids: AreaId[] }) {
  const t = getMessages(lang);
  return (
    <div className="not-prose my-4 flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      {ids.map((id) => (
        <div key={id} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="min-w-40 font-medium">{areaLabel(id, lang)}</span>
          {NETWORK_ORDER.map((network) => {
            const state = areaState(id, network);
            return (
              <span key={network} className="inline-flex items-center gap-2">
                <span className="text-muted-foreground">{networkLabel(t, network)}</span>
                <StateChip state={state} label={stateLabel(t, state)} />
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** What runs today and what is not built yet, per capability, straight from CAPABILITY_SCOPE. */
export function ScopeList({ lang, ids }: { lang: string; ids?: AreaId[] }) {
  const t = getMessages(lang);
  const rows = (ids ?? AREAS).flatMap((id) => {
    const scope = scopeOf(id);
    return scope ? [{ id, scope }] : [];
  });
  return (
    <div className="not-prose my-6 flex flex-col gap-4">
      {rows.map(({ id, scope }) => (
        <section key={id} className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-base font-semibold">{areaLabel(id, lang)}</h3>
          {scope.supports.length > 0 ? (
            <>
              <p className="mt-3 text-xs font-semibold text-foreground">{t.scope.supports}</p>
              <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">
                {scope.supports.map((line) => (
                  <li key={line}>{translateScope(lang, line)}</li>
                ))}
              </ul>
            </>
          ) : null}
          {scope.notYet.length > 0 ? (
            <>
              <p className="mt-3 text-xs font-semibold text-muted-foreground">{t.scope.notYet}</p>
              <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {scope.notYet.map((line) => (
                  <li key={line}>{translateScope(lang, line)}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ))}
    </div>
  );
}

type LimitKey = "daily" | "perTransaction" | "weekly" | "monthly" | "perRecipientWeekly" | "firstTimeRecipientApprovalThreshold";
const LIMIT_ROWS: readonly { key: LimitKey; label: keyof Messages["limits"] }[] = [
  { key: "daily", label: "daily" },
  { key: "perTransaction", label: "perTransaction" },
  { key: "weekly", label: "weekly" },
  { key: "monthly", label: "monthly" },
  { key: "perRecipientWeekly", label: "perRecipientWeekly" },
  { key: "firstTimeRecipientApprovalThreshold", label: "firstTime" },
];
const WHOLE_DOLLARS = 0;

/** The default limits per network, from DEFAULT_LIMITS (packages/config/src/limits.ts). */
export function LimitsTable({ lang }: { lang: string }) {
  const t = getMessages(lang);
  const show = (network: NetworkId, key: LimitKey) =>
    formatAmount(amount("USDC", DEFAULT_LIMITS[network][key]), lang, { fractionDigits: WHOLE_DOLLARS });
  return (
    <figure className="not-prose my-6">
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="px-4 py-3 text-start font-semibold">
                {t.limits.rule}
              </th>
              <th scope="col" className="px-4 py-3 text-end font-semibold">
                {t.limits.mainnet}
              </th>
              <th scope="col" className="px-4 py-3 text-end font-semibold">
                {t.limits.testnet}
              </th>
            </tr>
          </thead>
          <tbody>
            {LIMIT_ROWS.map((row) => (
              <tr key={row.key} className="border-t border-border">
                <th scope="row" className="px-4 py-2.5 text-start font-medium">
                  {t.limits[row.label]}
                </th>
                <td dir="ltr" className="px-4 py-2.5 text-end font-mono tabular-nums">
                  {show("mainnet", row.key)}
                </td>
                <td dir="ltr" className="px-4 py-2.5 text-end font-mono tabular-nums">
                  {show("testnet", row.key)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">{t.limits.caption}</figcaption>
    </figure>
  );
}
