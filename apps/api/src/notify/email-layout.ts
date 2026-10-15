// Every email Kawase sends wears one layout (Abu, 10-15: "it does have our logo, it's not mediocre"). Money that moved
// is the receipt slip itself, as the app draws it (receipt/receipt-slip.tsx; Abu: "the receipt of our image, the QR
// code and everything"): the mark and the folio, "You sent" over the amount with the coin's mark and the vermilion
// hanko pressed beside it, who with, the facts, a perforation with its notches, and the stub whose QR opens the
// transaction on the explorer. Anything else (a code, a reminder) is a white card with the mark and a magenta rule.
// Under either: an ink button into the app and the plain reasons it came. Tables and inline styles only (mail clients
// strip the rest); light on purpose (most clients render email light, and the paper is the brand's first look).
import { PUBLIC_LINKS } from "@kawase/config";

const PAPER = "#F5F5F5";
const CARD = "#FFFFFF";
const INK = "#000000";
const TEXT2 = "#5C5C5C";
const RULE = "#E6E6E6";
const MAGENTA = "#FA00FF";
const UP = "#2F7A00";
const HASH_HEAD = 10;
const HASH_TAIL = 6;
/** Pictures by URL (mail clients do not show SVG): the api serves them (public/routes.ts). */
const ASSET = `${PUBLIC_LINKS.api}/public/email`;
const MARK_PX = 36;
const SLIP_MARK_PX = 26;
const COIN_PX = 30;
const HANKO_PX = 84;
const QR_PX = 92;
const NOTCH_PX = 18;
/** The notch is a half circle at each end of the perforation. */
const NOTCH_HALF = 9;
/** The mark's corner radius, as the app icon's (a quarter of its size). */
const MARK_ROUND = 4;
const SLIP_WIDTH = 440;
const CARD_WIDTH = 520;

export type EmailFact = { label: string; value: string; href?: string | undefined; mono?: boolean | undefined };
export type EmailLink = { label: string; href: string };

/** The receipt slip, drawn in the email. */
export type EmailSlip = {
  /** "RECEIPT #ABABC2". */
  folio: string;
  /** "You sent". */
  label: string;
  /** "4.49 USDC". */
  amount: string;
  tone: "in" | "neutral";
  /** "usdc" | "eurc": the coin's mark beside the amount. */
  coin?: "usdc" | "eurc" | undefined;
  /** "To 0xb322…b2e2". */
  lead?: string | undefined;
  facts: EmailFact[];
  /** The stub: the QR to the transaction and its words. */
  verify?: { title: string; link: EmailLink; qr: string; footer: string } | undefined;
};

export type EmailContent = {
  rtl: boolean;
  /** The line mail apps show after the subject in the list. */
  preheader: string;
  /** Money that moved: the slip replaces the plain card's figure and facts. */
  slip?: EmailSlip | undefined;
  /** Top right of the plain card: "TESTNET". */
  eyebrow?: string | undefined;
  /** "Your Kawase code": small, above the headline. */
  label?: string | undefined;
  headline: string;
  body?: string | undefined;
  /** A one-time code, drawn large in its own box. */
  code?: string | undefined;
  primary?: EmailLink | undefined;
  secondary?: EmailLink[] | undefined;
  footer: string[];
};

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export const shortHash = (hash: string) => (hash.length > HASH_HEAD + HASH_TAIL ? `${hash.slice(0, HASH_HEAD)}…${hash.slice(-HASH_TAIL)}` : hash);

/** The QR picture for one transaction (served by the api). */
export const receiptQrUrl = (network: "mainnet" | "testnet", hash: string) => `${PUBLIC_LINKS.api}/public/receipt-qr/${network}/${hash}.png`;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const DISPLAY = "'Roboto Condensed','Arial Narrow',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const TABLE = `role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`;

function factRows(facts: EmailFact[], rtl: boolean): string {
  const end = rtl ? "left" : "right";
  return facts
    .map((fact) => {
      const value = escapeHtml(fact.value);
      const shown = fact.href ? `<a href="${escapeHtml(fact.href)}" style="color:${INK};text-decoration:underline">${value}</a>` : value;
      return `<tr>
<td style="padding:6px 0;font:13px/20px ${FONT};color:${TEXT2};vertical-align:top">${escapeHtml(fact.label)}</td>
<td style="padding:6px 0;font:${fact.mono ? `13px/20px ${MONO}` : `600 14px/20px ${FONT}`};color:${INK};text-align:${end};vertical-align:top;word-break:break-all">${shown}</td>
</tr>`;
    })
    .join("");
}

/** The brand line at the top of a card: the mark and the word, with something on the far side. */
function brandRow(markPx: number, aside: string | undefined, rtl: boolean): string {
  const end = rtl ? "left" : "right";
  return `<table ${TABLE}><tr>
<td style="vertical-align:middle"><img src="${ASSET}/mark.png" width="${markPx}" height="${markPx}" alt="Kawase" style="display:inline-block;vertical-align:middle;border-radius:${Math.round(markPx / MARK_ROUND)}px;border:0"><span style="display:inline-block;vertical-align:middle;padding:0 10px;font:800 18px/1 ${DISPLAY};color:${INK}">Kawase</span></td>
${aside ? `<td style="vertical-align:middle;text-align:${end};font:600 11px/1.3 ${FONT};color:${TEXT2};letter-spacing:1.2px;text-transform:uppercase">${escapeHtml(aside)}</td>` : ""}
</tr></table>`;
}

/** The perforation: a dashed rule with a notch cut out of each side, in the paper's colour. */
function perforation(): string {
  const notch = (side: "left" | "right") =>
    `<td width="${NOTCH_HALF}" style="width:${NOTCH_HALF}px;padding:0"><div style="width:${NOTCH_HALF}px;height:${NOTCH_PX}px;background:${PAPER};border-radius:${side === "left" ? `0 ${NOTCH_PX}px ${NOTCH_PX}px 0` : `${NOTCH_PX}px 0 0 ${NOTCH_PX}px`}"></div></td>`;
  return `<tr><td style="padding:0"><table ${TABLE}><tr>${notch("left")}<td style="padding:0 12px"><div style="border-top:1px dashed #CFCFCF;height:1px;line-height:1px;font-size:1px">&nbsp;</div></td>${notch("right")}</tr></table></td></tr>`;
}

function slipCard(slip: EmailSlip, rtl: boolean): string {
  const end = rtl ? "left" : "right";
  const figure = slip.tone === "in" ? UP : INK;
  const coin = slip.coin ? `<img src="${ASSET}/${slip.coin}.png" width="${COIN_PX}" height="${COIN_PX}" alt="${slip.coin.toUpperCase()}" style="display:inline-block;vertical-align:middle;border:0;border-radius:50%;margin-inline-end:10px">` : "";
  const stub = slip.verify
    ? `${perforation()}
<tr><td style="padding:18px 24px 22px"><table ${TABLE}><tr>
<td style="vertical-align:middle">
<div style="font:700 15px/1.3 ${FONT};color:${INK}">${escapeHtml(slip.verify.title)}</div>
<div style="font:13px/1.5 ${FONT};margin:4px 0 0"><a href="${escapeHtml(slip.verify.link.href)}" style="color:${INK};text-decoration:underline">${escapeHtml(slip.verify.link.label)}</a></div>
<div style="font:12px/1.5 ${FONT};color:${TEXT2};margin:8px 0 0">${escapeHtml(slip.verify.footer)}</div>
</td>
<td width="${QR_PX}" style="width:${QR_PX}px;vertical-align:middle;text-align:${end}"><a href="${escapeHtml(slip.verify.link.href)}"><img src="${escapeHtml(slip.verify.qr)}" width="${QR_PX}" height="${QR_PX}" alt="QR" style="display:block;border:0;border-radius:8px"></a></td>
</tr></table></td></tr>`
    : "";
  return `<table ${TABLE} style="max-width:${SLIP_WIDTH}px;background:${CARD};border-radius:20px;box-shadow:0 18px 40px rgba(0,0,0,0.10);border:1px solid ${RULE}">
<tr><td style="padding:22px 24px 0">${brandRow(SLIP_MARK_PX, slip.folio, rtl)}</td></tr>
<tr><td style="padding:20px 24px 0"><table ${TABLE}><tr>
<td style="vertical-align:top">
<div style="font:600 11px/1.4 ${FONT};color:${TEXT2};letter-spacing:1.2px;text-transform:uppercase;margin:0 0 6px">${escapeHtml(slip.label)}</div>
<div style="font:900 34px/1.1 ${DISPLAY};color:${figure};letter-spacing:-0.3px">${coin}<bdi style="unicode-bidi:isolate;vertical-align:middle">${escapeHtml(slip.amount)}</bdi></div>
${slip.lead ? `<div style="font:15px/1.5 ${FONT};color:${TEXT2};margin:6px 0 0">${escapeHtml(slip.lead)}</div>` : ""}
</td>
<td width="${HANKO_PX}" style="width:${HANKO_PX}px;vertical-align:top;text-align:${end}"><img src="${ASSET}/hanko.png" width="${HANKO_PX}" height="${HANKO_PX}" alt="" style="display:block;border:0"></td>
</tr></table></td></tr>
<tr><td style="padding:14px 24px 16px"><div style="border-top:1px solid ${RULE};padding-top:8px"><table ${TABLE}>${factRows(slip.facts, rtl)}</table></div></td></tr>
${stub}
</table>`;
}

function plainCard(content: EmailContent): string {
  return `<table ${TABLE} style="max-width:${CARD_WIDTH}px;background:${CARD};border:1px solid ${RULE};border-radius:24px;overflow:hidden">
<tr><td style="height:4px;background:${MAGENTA};font-size:1px;line-height:4px">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 8px">${brandRow(MARK_PX, content.eyebrow, content.rtl)}</td></tr>
<tr><td style="padding:20px 28px 28px">
${content.label ? `<div style="font:600 12px/1.4 ${FONT};color:${TEXT2};letter-spacing:1.2px;text-transform:uppercase;margin:0 0 6px">${escapeHtml(content.label)}</div>` : ""}
<div style="font:900 36px/1.1 ${DISPLAY};color:${INK};letter-spacing:-0.4px;margin:0"><bdi style="unicode-bidi:isolate">${escapeHtml(content.headline)}</bdi></div>
${content.body ? `<div style="font:16px/1.55 ${FONT};color:${INK};margin:14px 0 0">${escapeHtml(content.body)}</div>` : ""}
${content.code ? `<div style="margin:20px 0 0;padding:20px;background:${PAPER};border-radius:16px;text-align:center;font:700 36px/1 ${MONO};letter-spacing:10px;color:${INK}">${escapeHtml(content.code)}</div>` : ""}
</td></tr>
</table>`;
}

/** The email's HTML: the slip or the card on the paper page, then the way into the app and why it came. */
export function emailHtml(content: EmailContent): string {
  const dir = content.rtl ? "rtl" : "ltr";
  const width = content.slip ? SLIP_WIDTH : CARD_WIDTH;
  const links =
    content.secondary && content.secondary.length > 0
      ? `<div style="margin:14px 0 0;font:14px/1.6 ${FONT}">${content.secondary.map((link) => `<a href="${escapeHtml(link.href)}" style="color:${INK};text-decoration:underline;margin-inline-end:16px">${escapeHtml(link.label)}</a>`).join(" ")}</div>`
      : "";
  return `<!doctype html>
<html dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@800;900&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(content.preheader)}</div>
<table ${TABLE} style="background:${PAPER}">
<tr><td align="center" style="padding:32px 16px">
${content.slip ? slipCard(content.slip, content.rtl) : plainCard(content)}
<table ${TABLE} style="max-width:${width}px">
<tr><td style="padding:24px 4px 0;text-align:start">
${content.primary ? `<a href="${escapeHtml(content.primary.href)}" style="display:inline-block;background:${INK};color:#FFFFFF;font:600 15px/1 ${FONT};padding:15px 26px;border-radius:999px;text-decoration:none">${escapeHtml(content.primary.label)}</a>` : ""}
${links}
<div style="margin:24px 0 0;font:12px/1.6 ${FONT};color:${TEXT2}">${content.footer.map(escapeHtml).join("<br>")}</div>
<div style="margin:16px 0 0;font:12px/1.6 ${FONT};color:${TEXT2}"><a href="https://getkawase.xyz" style="color:${TEXT2};text-decoration:none">getkawase.xyz</a> · Money that moves when you speak</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The same content as plain text, for clients that show no HTML. */
export function emailText(content: EmailContent): string {
  const slip = content.slip;
  return [
    slip ? slip.label : content.label,
    slip ? slip.amount : content.headline,
    slip?.lead,
    content.body,
    content.code,
    "",
    ...(slip?.facts ?? []).map((fact) => `${fact.label}: ${fact.value}${fact.href ? ` (${fact.href})` : ""}`),
    slip?.verify ? `${slip.verify.title}: ${slip.verify.link.href}` : undefined,
    "",
    content.primary ? `${content.primary.label}: ${content.primary.href}` : undefined,
    ...(content.secondary ?? []).map((link) => `${link.label}: ${link.href}`),
    "",
    ...content.footer,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}
