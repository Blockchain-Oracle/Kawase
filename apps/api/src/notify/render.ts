// Colours: the light theme of packages/ui-tokens (ink button, lime label), since mail clients default to light.
// What a push or an email says about an inbox item, in the person's language: the same words as the inbox row (the
// catalogs are shared with the app), testnet prefixed so test money never reads as real, and the app screen it opens.
import type { InboxKind } from "@kawase/api-client";
import { CATALOGS, type CatalogLocale } from "@kawase/i18n";
import { amount, formatAmount, type AssetId } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;

export type RenderedNotification = { title: string; body: string; /** The app path the tap opens. */ path: string };

type Item = { kind: InboxKind; network: NetworkId; params: Record<string, string> };
type Block = "notify" | "automation" | "inbox";

function text(locale: CatalogLocale, block: Block, key: string, values: Record<string, string> = {}): string {
  const pick = (catalog: unknown) => (catalog as Record<Block, Record<string, unknown>>)[block]?.[key];
  const template = pick(CATALOGS[locale]) ?? pick(CATALOGS.en);
  if (typeof template !== "string") return key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] ?? "");
}

const short = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

export function renderNotification(item: Item, locale: CatalogLocale): RenderedNotification {
  const p = item.params;
  const money = (asset: string | undefined, baseUnits: string | undefined) =>
    asset && baseUnits ? formatAmount(amount(asset as AssetId, BigInt(baseUnits)), locale) : "";
  const counterparty = item.kind === "send_completed" || item.kind === "automation_skipped" ? p.to : p.from;
  const name = p.name || (counterparty ? short(counterparty) : "");
  const sum = money(p.asset, p.amount);

  let title: string;
  let body: string;
  let path = "/inbox";
  switch (item.kind) {
    case "payment_received":
      title = text(locale, "notify", "receivedTitle", { amount: sum });
      body = text(locale, "notify", "receivedBody", { name });
      break;
    case "request_paid":
      title = text(locale, "notify", "requestPaidTitle");
      body = text(locale, "notify", "requestPaidBody", { amount: sum, name });
      break;
    case "send_completed":
      title = text(locale, "notify", "sentTitle", { amount: sum });
      body = text(locale, "notify", "sentBody", { name });
      break;
    case "automation_skipped":
      title = text(locale, "notify", "skippedTitle");
      body = text(locale, "notify", "skippedBody");
      path = "/automations";
      break;
    case "rule_alert":
      title =
        p.trigger === "money_in"
          ? text(locale, "automation", "ruleAlertMoneyIn", { amount: sum })
          : text(locale, "automation", p.trigger === "balance_above" ? "ruleAlertAbove" : "ruleAlertBelow", { amount: money("USDC", p.threshold) });
      body = p.balance ? text(locale, "automation", "ruleAlertBalance", { amount: money("USDC", p.balance) }) : "";
      path = "/automations";
      break;
    case "position_health":
      // Aave V4 health is one per account: margin positions and borrowing share it.
      title = text(locale, "notify", p.level === "danger" ? "healthDangerTitle" : "healthWarningTitle", { health: p.health ?? "" });
      body = text(locale, "notify", "healthBody");
      path = p.path || "/margin";
      break;
    case "position_closed": {
      const position = `${p.market ?? ""} ${text(locale, "notify", `side_${p.side === "short" ? "short" : "long"}`)}`;
      const closed = p.outcome === "closed";
      title = closed ? text(locale, "notify", p.reason === "take_profit" ? "takeProfitTitle" : "stopLossTitle", { position }) : text(locale, "notify", "protectFailedTitle", { position });
      body = closed ? text(locale, "notify", "protectClosedBody", { amount: sum }) : text(locale, "notify", "protectFailedBody");
      path = "/margin";
      break;
    }
  }
  if (item.network === "testnet") title = `${text(locale, "notify", "testnet")} · ${title}`;
  return { title, body, path };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The email for one item: plain words, one link into the app, and why it came. */
export function renderEmail(rendered: RenderedNotification, locale: CatalogLocale, webUrl: string, rtl: boolean) {
  const link = `${webUrl.replace(/\/$/, "")}${rendered.path}`;
  const open = text(locale, "notify", "emailOpen");
  const never = text(locale, "notify", "emailNeverApprove");
  const why = text(locale, "notify", "emailWhy");
  const lines = [rendered.title, rendered.body].filter(Boolean);
  return {
    subject: rendered.title,
    text: [...lines, "", `${open}: ${link}`, "", never, why].join("\n"),
    html: `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}"><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#101210;background:#F7F8F4;line-height:1.5">
<p style="font-size:18px;font-weight:600;margin:0 0 4px">${escapeHtml(rendered.title)}</p>
${rendered.body ? `<p style="margin:0 0 16px">${escapeHtml(rendered.body)}</p>` : ""}
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#101210;color:#D4FF3A;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(open)}</a></p>
<p style="color:#5C6158;font-size:13px;margin-top:24px">${escapeHtml(never)}<br>${escapeHtml(why)}</p>
</body></html>`,
  };
}
