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

type Item = { kind: InboxKind; network: NetworkId; params: Record<string, string>; intentId?: string | null; requestId?: string | null; txHash?: string | null };
type Block = "notify" | "automation" | "inbox" | "alerts";

function text(locale: CatalogLocale, block: Block, key: string, values: Record<string, string> = {}): string {
  const pick = (catalog: unknown) => (catalog as Record<Block, Record<string, unknown>>)[block]?.[key];
  const template = pick(CATALOGS[locale]) ?? pick(CATALOGS.en);
  if (typeof template !== "string") return key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] ?? "");
}

const short = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

/**
 * `hideAmounts` (Settings → Notifications, plan §A.4.11 "hide amounts on the lock screen"): the words carry no figure —
 * "You received money" — for a push that shows on a locked phone. The inbox and email keep the amounts.
 */
export function renderNotification(item: Item, locale: CatalogLocale, options: { hideAmounts?: boolean } = {}): RenderedNotification {
  const p = item.params;
  const hide = options.hideAmounts === true;
  // Any token (R1): USDC/EURC by their ids, others by the decimals the item carries.
  const money = (asset: string | undefined, baseUnits: string | undefined) => {
    if (!asset || !baseUnits || hide) return "";
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
      title = hide ? text(locale, "notify", "receivedTitleHidden") : text(locale, "notify", "receivedTitle", { amount: sum });
      body = text(locale, "notify", "receivedBody", { name });
      break;
    // Someone on Kawase asked the person for money (a split share or a request): the tap opens the pay card.
    case "request_received":
      // A reminder (the requester's Remind, or Kawase's own) says so in its title.
      title = p.reminder
        ? hide
          ? text(locale, "notify", "requestReminderTitleHidden", { name })
          : text(locale, "notify", "requestReminderTitle", { name, amount: sum })
        : hide
          ? text(locale, "notify", "requestReceivedTitleHidden", { name })
          : text(locale, "notify", "requestReceivedTitle", { name, amount: sum });
      body = p.note || text(locale, "notify", "requestReceivedBody");
      path = p.token ? `/r/${p.token}` : "/inbox";
      break;
    case "request_paid":
      title = text(locale, "notify", "requestPaidTitle");
      body = hide ? text(locale, "notify", "receivedBody", { name }) : text(locale, "notify", "requestPaidBody", { amount: sum, name });
      break;
    case "send_completed":
      title = hide ? text(locale, "notify", "sentTitleHidden") : text(locale, "notify", "sentTitle", { amount: sum });
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
          ? hide
            ? text(locale, "notify", "needsYouSwapHidden", { symbolIn: p.symbolIn ?? "", symbolOut: p.symbolOut ?? "" })
            : text(locale, "notify", "needsYouSwap", { amount: p.decimalsIn ? trimUnits(p.amount ?? "0", Number(p.decimalsIn)) : "", symbolIn: p.symbolIn ?? "", symbolOut: p.symbolOut ?? "" })
          : hide
            ? text(locale, "notify", "needsYouSendHidden", { name })
            : text(locale, "notify", "needsYouSend", { amount: sum, name });
      title = text(locale, "notify", p.reminder ? "needsYouReminderTitle" : "needsYouTitle");
      body = what;
      path = p.itemId ? `/needs-you/${p.itemId}?from=push` : "/inbox";
      break;
    }
    // The 24 h reminder: tomorrow's run, with a heads-up when the wallet is short.
    case "automation_reminder": {
      const at = p.at ? new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(p.at)) : "";
      const what =
        p.automationKind === "dca"
          ? `${hide ? "" : `${p.tokenAmount ?? ""} `}${p.symbolIn ?? ""} → ${p.name ?? ""}`
          : hide
            ? `→ ${name}`
            : `${sum} → ${name}`;
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
      if (hide) {
        // A balance line or money in, without the figures: just that a rule of theirs went off.
        title = p.trigger === "money_in" ? text(locale, "notify", "receivedTitleHidden") : text(locale, "notify", "ruleAlertHidden");
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
    case "position_health":
      // Aave V4 health is one per account: margin positions and borrowing share it.
      title = text(locale, "notify", p.level === "danger" ? "healthDangerTitle" : "healthWarningTitle", { health: p.health ?? "" });
      body = text(locale, "notify", "healthBody");
      path = p.path || "/margin";
      break;
    case "position_closed": {
      const position = `${p.market ?? ""} ${text(locale, "notify", `side_${p.side === "short" ? "short" : "long"}`)}`;
      const closed = p.outcome === "closed";
      // Practice mode, or a pause holding a take-profit back: the target was hit and the position is still open.
      const held = p.outcome === "practice" || p.outcome === "paused";
      title = closed
        ? text(locale, "notify", p.reason === "take_profit" ? "takeProfitTitle" : "stopLossTitle", { position })
        : text(locale, "notify", held ? "protectHeldTitle" : "protectFailedTitle", { position });
      body = closed ? text(locale, "notify", "protectClosedBody", { amount: sum }) : text(locale, "notify", held ? (p.outcome === "practice" ? "protectPracticeBody" : "protectPausedBody") : "protectFailedBody");
      path = "/margin";
      break;
    }
    case "token_graduated":
      title = text(locale, "notify", "graduatedTitle", { symbol: p.symbol ?? "", launchpad: p.launchpad ?? "" });
      body = text(locale, "notify", "graduatedBody", { symbol: p.symbol ?? "" });
      path = p.token ? `/token/5042/${p.token}` : "/markets";
      break;
    case "device_signed_in":
    case "device_signed_out": {
      const device = p.name || text(locale, "alerts", "aDevice");
      title = text(locale, "alerts", item.kind === "device_signed_in" ? "deviceSignedInTitle" : "deviceSignedOutTitle", { name: device });
      body =
        item.kind === "device_signed_out"
          ? text(locale, "alerts", "deviceSignedOutBody")
          : text(locale, "alerts", p.location ? "deviceSignedInBody" : "deviceSignedInBodyNoPlace", { platform: p.platform ?? "", location: p.location ?? "" });
      path = "/account/devices";
      break;
    }
  }
  // An automation's item opens that run's story, or that automation's own card; the list only when neither is known.
  if (path === "/automations") {
    if (p.runId) path = `/why/run/${p.runId}`;
    else if (p.automationId) path = `/i/${p.automationId}`;
  }
  // The exact thing it is about (plan §A.4.11): the action's own card by id, the request, or why money arrived.
  if (path === "/inbox") {
    if (item.intentId) path = `/i/${item.intentId}`;
    else if (item.requestId) path = `/request?id=${item.requestId}`;
    else if (item.txHash) path = `/why/${item.txHash}?network=${item.network}`;
  }
  // Security notices are about the account, not about test money.
  const security = item.kind === "device_signed_in" || item.kind === "device_signed_out";
  if (item.network === "testnet" && !security) title = `${text(locale, "notify", "testnet")} · ${title}`;
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
