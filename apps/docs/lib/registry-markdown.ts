// Markdown versions of the registry-driven MDX blocks, for llms.txt, llms-full.txt and the `.md` twins of pages.
import { DEFAULT_LIMITS } from "@kawase/config";
import { amount, formatAmount } from "@kawase/money";

import { getMessages, translateScope } from "./messages";
import { AREAS, NETWORK_ORDER, areaLabel, areaState, scopeOf, type AreaId } from "./product";

const WHOLE_DOLLARS = 0;

function matrix(lang: string): string {
  const t = getMessages(lang);
  const header = `| ${t.matrix.capability} | ${t.matrix.mainnet} | ${t.matrix.testnet} |\n|---|---|---|`;
  const rows = AREAS.map(
    (id) => `| ${areaLabel(id, lang)} | ${NETWORK_ORDER.map((network) => t.state[areaState(id, network)]).join(" | ")} |`,
  );
  return [header, ...rows, "", `_${t.matrix.caption}_`].join("\n");
}

function status(lang: string, ids: AreaId[]): string {
  const t = getMessages(lang);
  return ids
    .map(
      (id) =>
        `**${areaLabel(id, lang)}**: ${t.matrix.mainnet}: ${t.state[areaState(id, "mainnet")]} · ${t.matrix.testnet}: ${t.state[areaState(id, "testnet")]}`,
    )
    .join("\n\n");
}

function scope(lang: string, ids?: AreaId[]): string {
  const t = getMessages(lang);
  return (ids ?? AREAS)
    .flatMap((id) => {
      const entry = scopeOf(id);
      if (!entry) return [];
      const lines = [`### ${areaLabel(id, lang)}`];
      if (entry.supports.length) lines.push(`${t.scope.supports}:`, ...entry.supports.map((s) => `- ${translateScope(lang, s)}`));
      if (entry.notYet.length) lines.push(`${t.scope.notYet}:`, ...entry.notYet.map((s) => `- ${translateScope(lang, s)}`));
      return [lines.join("\n")];
    })
    .join("\n\n");
}

function limits(lang: string): string {
  const t = getMessages(lang);
  const fmt = (value: bigint) => formatAmount(amount("USDC", value), lang, { fractionDigits: WHOLE_DOLLARS });
  const rows: [string, keyof typeof DEFAULT_LIMITS.mainnet][] = [
    [t.limits.daily, "daily"],
    [t.limits.perTransaction, "perTransaction"],
    [t.limits.weekly, "weekly"],
    [t.limits.monthly, "monthly"],
    [t.limits.perRecipientWeekly, "perRecipientWeekly"],
    [t.limits.firstTime, "firstTimeRecipientApprovalThreshold"],
  ];
  return [
    `| ${t.limits.rule} | ${t.limits.mainnet} | ${t.limits.testnet} |`,
    "|---|---|---|",
    ...rows.map(([label, key]) => `| ${label} | ${fmt(DEFAULT_LIMITS.mainnet[key] as bigint)} | ${fmt(DEFAULT_LIMITS.testnet[key] as bigint)} |`),
  ].join("\n");
}

const ids = (raw: string | undefined) => (raw ? (raw.split(/\s+/).filter(Boolean) as AreaId[]) : undefined);

/** Replaces `<AvailabilityMatrix />`, `<Status ids="…" />`, `<ScopeList ids="…" />`, `<LimitsTable />` and drops `<Marks … />`. */
export function expandRegistryBlocks(markdown: string, lang: string): string {
  return markdown
    .replace(/<AvailabilityMatrix\s*\/>/g, () => matrix(lang))
    .replace(/<LimitsTable\s*\/>/g, () => limits(lang))
    .replace(/<Status\s+ids="([^"]*)"\s*\/>/g, (_, raw: string) => status(lang, ids(raw) ?? []))
    .replace(/<ScopeList(?:\s+ids="([^"]*)")?\s*\/>/g, (_, raw: string | undefined) => scope(lang, ids(raw)))
    .replace(/<Marks\s+[^>]*\/>/g, "");
}
