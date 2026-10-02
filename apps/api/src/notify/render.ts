// Colours: the light theme of packages/ui-tokens (ink button, lime label), since mail clients default to light.
// What a push or an email says about an inbox item, in the person's language: the same words as the inbox row (the
// catalogs are shared with the app), testnet prefixed so test money never reads as real, and the app screen it opens.
import type { InboxKind } from "@kawase/api-client";
import { CATALOGS, type CatalogLocale } from "@kawase/i18n";
import { ASSETS, amount, formatAmount, formatTokenAmount, type AssetId } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const TEN = 10n;
const TOKEN_DIGITS = 6;

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
  // Any token (R1): USDC/EURC by their ids, others by the decimals the item carries.
  const money = (asset: string | undefined, baseUnits: string | undefined) => {
    if (!asset || !baseUnits) return "";
    if (asset in ASSETS) return formatAmount(amount(asset as AssetId, BigInt(baseUnits)), locale);
    return p.decimals ? formatTokenAmount(BigInt(baseUnits), Number(p.decimals), asset, locale, { fractionDigits: TOKEN_DIGITS, trimZeros: true }) : `${baseUnits} ${asset}`;
  };
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
    // A step waiting for the person (Needs you): what, and a tap that opens it to approve or decline.
    case "needs_you": {
      const what =
        p.type === "swap"
          ? text(locale, "notify", "needsYouSwap", { amount: p.decimalsIn ? trimUnits(p.amount ?? "0", Number(p.decimalsIn)) : "", symbolIn: p.symbolIn ?? "", symbolOut: p.symbolOut ?? "" })
          : text(locale, "notify", "needsYouSend", { amount: sum, name });
      title = text(locale, "notify", p.reminder ? "needsYouReminderTitle" : "needsYouTitle");
      body = what;
      path = p.itemId ? `/needs-you/${p.itemId}?from=push` : "/inbox";
      break;
    }
    // The 24 h reminder: tomorrow's run, with a heads-up when the wallet is short.
    case "automation_reminder": {
      const at = p.at ? new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(p.at)) : "";
      const what = p.automationKind === "dca" ? `${p.tokenAmount ?? ""} ${p.symbolIn ?? ""} → ${p.name ?? ""}` : p.automationKind === "payroll" ? text(locale, "notify", "reminderPayroll", { people: p.people ?? "" }) : `${sum} → ${name}`;
      title = text(locale, "notify", "reminderTitle", { at });
      body = [what, p.short ? text(locale, "notify", "reminderShort") : ""].filter(Boolean).join(" · ");
      path = "/automations";
      break;
    }
    case "rule_alert":
      if (p.trigger === "price") {
        title = text(locale, "automation", "ruleAlertPrice", { amountIn: p.amountIn ?? "", symbolIn: p.symbolIn ?? "", quotedOut: p.quotedOut ?? "", symbolOut: p.symbolOut ?? "" });
        body = "";
        path = "/automations";
        break;
      }
      title =
        p.trigger === "money_in"
          ? text(locale, "automation", "ruleAlertMoneyIn", { amount: sum })
          : text(locale, "automation", p.trigger === "balance_above" ? "ruleAlertAbove" : "ruleAlertBelow", { amount: money("USDC", p.threshold) });
      body = p.balance ? text(locale, "automation", "ruleAlertBalance", { amount: money("USDC", p.balance) }) : "";
      path = "/automations";
      break;
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

/** Base units in a token's own decimals as a plain number ("12.5"), for tokens the shared money formatter does not know. */
function trimUnits(baseUnits: string, decimals: number): string {
  const value = BigInt(baseUnits);
  const divisor = TEN ** BigInt(decimals);
  const fraction = (value % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${value / divisor}.${fraction}` : `${value / divisor}`;
}
