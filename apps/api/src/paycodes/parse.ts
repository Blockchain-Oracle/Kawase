// What a scanned or pasted payment code says (scan to pay, plan §A.4.4; C1): a bare address, an EIP-681 link
// (`ethereum:` with an optional chain, token, recipient and amount), or a Kawase link to a payment request or an
// invoice (`/r/<token>` on Kawase's own hosts, `kawase://r/<token>`, the invoice document link). Pure: no network
// calls, so the scanner, the chat and the tests read codes the same way. A Kawase-looking path on any other host is
// not trusted (a lookalike site could print one).
import { getAddress, isAddress } from "viem";

export type ParsedCode =
  | {
      kind: "address";
      address: string;
      chainId: number | null;
      token: string | null;
      native: boolean;
      amount: string | null;
      /** An ERC-20 amount whose token's decimals were not known when parsing, as written (base units). */
      rawAmount?: string | undefined;
    }
  | { kind: "request"; token: string }
  | { kind: "unknown" };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL = /^\d+(\.\d+)?([eE][+-]?\d+)?$/;
const NATIVE_DECIMALS = 18;
const MAX_FRACTION = 18;

/** "1e6", "2.5e6", "1000000" → an exact decimal string of base units divided by 10^decimals (no float rounding). */
export function scaledAmount(raw: string, decimals: number): string | null {
  if (!DECIMAL.test(raw)) return null;
  const [mantissa, exponentPart] = raw.toLowerCase().split("e");
  const exponent = Number(exponentPart ?? "0") - decimals;
  const [whole = "0", fraction = ""] = mantissa!.split(".");
  let digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  let point = whole.length + exponent;
  if (point <= 0) {
    digits = `${"0".repeat(1 - point)}${digits}`;
    point = 1;
  }
  if (point >= digits.length) digits = digits.padEnd(point, "0");
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, "") || "0";
  const decimal = digits.slice(point).replace(/0+$/, "").slice(0, MAX_FRACTION);
  return decimal ? `${integer}.${decimal}` : integer;
}

const checksum = (value: string) => (isAddress(value, { strict: false }) ? getAddress(value) : null);

/** EIP-681: `ethereum:[pay-]<target>[@chainId][/function]?params`. */
function parseEip681(code: string, decimalsOf: (token: string) => number | null): ParsedCode {
  const match = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\/([A-Za-z0-9_]+))?(?:\?(.*))?$/.exec(code);
  if (!match) return { kind: "unknown" };
  const [, target, chain, fn, query] = match;
  const params = new URLSearchParams(query ?? "");
  const chainId = chain ? Number(chain) : null;
  if (fn === "transfer") {
    const recipient = checksum(params.get("address") ?? "");
    const token = checksum(target!);
    if (!recipient || !token) return { kind: "unknown" };
    const raw = params.get("uint256");
    const decimals = decimalsOf(token);
    return {
      kind: "address",
      address: recipient,
      chainId,
      token,
      native: false,
      amount: raw && decimals !== null ? scaledAmount(raw, decimals) : null,
      ...(raw && decimals === null ? { rawAmount: raw } : {}),
    };
  }
  if (fn) return { kind: "unknown" };
  const recipient = checksum(target!);
  if (!recipient) return { kind: "unknown" };
  const value = params.get("value");
  return { kind: "address", address: recipient, chainId, token: null, native: true, amount: value ? scaledAmount(value, NATIVE_DECIMALS) : null };
}

/**
 * Reads one code. `hosts` are Kawase's own web and api hosts (only their `/r/` and invoice links are trusted);
 * `decimalsOf` gives a known token's decimals (USDC and EURC are 6) for EIP-681 amounts.
 */
export function parsePayCode(input: string, hosts: readonly string[], decimalsOf: (token: string) => number | null): ParsedCode {
  const code = input.trim();
  if (HEX_ADDRESS.test(code)) {
    const address = checksum(code);
    return address ? { kind: "address", address, chainId: null, token: null, native: false, amount: null } : { kind: "unknown" };
  }
  if (/^ethereum:/i.test(code)) return parseEip681(code.replace(/^ethereum:/i, "ethereum:"), decimalsOf);
  // The app's own scheme: kawase://r/<token>, xyz.kawase.app://r/<token>.
  const scheme = /^(?:kawase|xyz\.kawase\.app):\/\/(?:\/)?r\/([^/?#]+)/i.exec(code);
  if (scheme) return TOKEN_PATTERN.test(scheme[1]!) ? { kind: "request", token: scheme[1]! } : { kind: "unknown" };
  let url: URL;
  try {
    url = new URL(code);
  } catch {
    return { kind: "unknown" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "unknown" };
  if (!hosts.includes(url.host.toLowerCase())) return { kind: "unknown" };
  const path = url.pathname.replace(/\/+$/, "");
  const request = /^\/r\/([^/]+)$/.exec(path) ?? /^\/invoices\/public\/([^/]+)(?:\/document)?$/.exec(path);
  return request && TOKEN_PATTERN.test(request[1]!) ? { kind: "request", token: request[1]! } : { kind: "unknown" };
}
