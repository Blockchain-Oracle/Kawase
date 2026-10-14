// Where the api may reach for a seller (security review 2026-10-03, SSRF through catalog listings). Anyone can list a
// resource in Circle's catalog, and the api calls it from inside Kawase's network, so a listing could point it at the
// server itself or a neighbour (the cloud metadata address, the database, an admin port). A listing is used only when
// its URL is https, names its host plainly (no `{param}` in the scheme, host or port) and, when the host is an IP, a
// public one. The check that matters happens at connect time: the host is resolved, every address it resolves to must
// be public, and the connection goes to the address that was checked, so a DNS answer that changes between the check
// and the call (rebinding) cannot slip through. Redirects are refused (one could lead anywhere). Kawase's own testnet
// demo seller is the one exception, by its configured origin.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

const NOT_PUBLIC = "ENOTPUBLIC";
const HTTP_REDIRECTS = { from: 300, to: 399 } as const;
/** Answers that carry no body by definition. */
const BODILESS_STATUS = { noContent: 204, resetContent: 205, notModified: 304 } as const;
const BODILESS = new Set<number>(Object.values(BODILESS_STATUS));
/** `net.isIP` answers 4 or 6. */
const IPV4 = 4;
/** `rawHeaders` lists name, value, name, value… */
const HEADER_PAIR = 2;

/** Every range that is not the public internet: private, loopback, link-local, shared, documentation, multicast, reserved. */
const PRIVATE_RANGES = {
  ipv4: ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"],
  ipv6: ["::/128", "::1/128", "64:ff9b::/96", "100::/64", "2001:db8::/32", "fc00::/7", "fe80::/10", "ff00::/8"],
} as const;
const PRIVATE = new BlockList();
for (const family of ["ipv4", "ipv6"] as const) {
  for (const range of PRIVATE_RANGES[family]) {
    const [network, prefix] = range.split("/");
    PRIVATE.addSubnet(network!, Number(prefix), family);
  }
}

const MAPPED_V4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/** True for an address on the public internet (an IPv4 address mapped into IPv6 is judged as itself). */
export function isPublicAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "");
  const mapped = MAPPED_V4.exec(bare)?.[1];
  if (mapped) return isPublicAddress(mapped);
  const family = isIP(bare);
  if (family === 0) return false;
  return !PRIVATE.check(bare, family === IPV4 ? "ipv4" : "ipv6");
}

/** The origin of a configured URL, or undefined when it is not one. */
export const originOf = (url: string | undefined) => {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/**
 * Why a listed resource cannot be called, or undefined when it can: https only, the scheme, host and port written out
 * (a `{param}` there would let whoever fills it choose the host), no credentials in it, and no private IP for a host.
 * `trusted`: origins called as they are (Kawase's own testnet demo seller).
 */
export function listingUrlProblem(resource: string, trusted: readonly string[] = []): string | undefined {
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(resource)?.[1];
  if (authority === undefined) return "not an absolute URL";
  if (/[{}]/.test(authority)) return "a template in the host";
  let url: URL;
  try {
    url = new URL(resource.replace(/\{[^}]*\}/g, "x"));
  } catch {
    return "not a URL";
  }
  if (trusted.includes(url.origin)) return undefined;
  if (url.protocol !== "https:") return "not https";
  if (url.username || url.password) return "credentials in the URL";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0 && !isPublicAddress(host)) return "a private address";
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return "a private host name";
  return undefined;
}

/** Resolves a host and answers only when every address it has is public (otherwise ENOTPUBLIC); used at connect time. */
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, "", 0);
    const blocked = addresses.find((entry) => !isPublicAddress(entry.address));
    if (!addresses.length || blocked) {
      const refused = Object.assign(new Error(`${hostname} is not a public address`), { code: NOT_PUBLIC });
      return callback(refused, "", 0);
    }
    if (options.all) return (callback as unknown as (error: null, addresses: LookupAddress[]) => void)(null, addresses);
    const [first] = addresses;
    return callback(null, first!.address, first!.family);
  });
};

const headersOf = (response: IncomingMessage) => {
  const headers = new Headers();
  for (let index = 0; index < response.rawHeaders.length; index += HEADER_PAIR) headers.append(response.rawHeaders[index]!, response.rawHeaders[index + 1]!);
  return headers;
};

/** One request through node's http(s) with the public-only lookup, answered as a fetch Response. */
function publicRequest(url: URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<Response>((resolve, reject) => {
    const outgoing = request(
      url,
      { method: init.method ?? "GET", headers: Object.fromEntries(headers.entries()), lookup: publicOnlyLookup, ...(init.signal ? { signal: init.signal } : {}) },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= HTTP_REDIRECTS.from && status <= HTTP_REDIRECTS.to) {
          response.resume();
          reject(new TypeError(`a seller answered with a redirect (${status}); not followed`));
          return;
        }
        const body = BODILESS.has(status) ? null : (Readable.toWeb(response) as unknown as ReadableStream<Uint8Array>);
        resolve(new Response(body, { status, statusText: response.statusMessage ?? "", headers: headersOf(response) }));
      },
    );
    outgoing.on("error", reject);
    if (typeof init.body === "string") outgoing.write(init.body);
    outgoing.end();
  });
}

/**
 * The fetch the marketplace calls sellers with. A URL the listing rules refuse never leaves; a trusted origin goes
 * through `base` as it is; anything else connects only to a public address (checked at connect time). `base` is
 * also what a test passes to answer in memory: the URL rules still apply to it.
 */
export function sellerFetch(options: { trusted?: readonly string[] | undefined; base?: typeof fetch | undefined } = {}): typeof fetch {
  const trusted = options.trusted ?? [];
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const why = listingUrlProblem(target, trusted);
    if (why) throw new TypeError(`refused to call ${target}: ${why}`);
    const url = new URL(target);
    if (trusted.includes(url.origin)) return (options.base ?? fetch)(target, init);
    if (options.base) return options.base(target, init);
    return publicRequest(url, init);
  }) as typeof fetch;
}
