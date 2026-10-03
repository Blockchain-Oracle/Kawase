// SSRF through x402 catalog listings (security review 2026-10-03, "plausible, verify"): anyone can list a resource in
// Circle's catalog and the api calls it from inside Kawase's network. A listing is now used only when it is https,
// names its host plainly (no `{param}` in the scheme, host or port) and is not a private address; the call itself
// resolves the host and connects only when every address is public, and follows no redirect. Kawase's own testnet
// demo seller is exempt by its configured origin. No network beyond this machine is needed.
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { getNetwork } from "@kawase/networks";
import { Discovery, isPublicAddress, listingUrlProblem, publicOnlyLookup, sellerFetch, toListing } from "@kawase/integrations-x402";

const network = getNetwork("testnet");
const item = (resource: string) => ({
  resource,
  accepts: [{ scheme: "exact", network: `eip155:${network.chainId}`, asset: network.addresses.usdc, amount: "1000", payTo: "0x000000000000000000000000000000000000dEaD", maxTimeoutSeconds: 60 }],
  metadata: { method: "GET", description: "x" },
});

let server: Server;
let local = "";
let hits = 0;
before(async () => {
  // Stands in for something on the api's own network (a metadata service, an admin port).
  server = createServer((_, response) => {
    hits += 1;
    response.end("internal");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

test("listing URLs: https only, the host written out, never a private address", () => {
  assert.equal(listingUrlProblem("https://api.example.com/prices/{coins}?vs={vs}"), undefined, "templates in the path are fine");
  assert.equal(listingUrlProblem("http://api.example.com/data"), "not https");
  assert.equal(listingUrlProblem("https://{host}/data"), "a template in the host");
  assert.equal(listingUrlProblem("https://api.{region}.example.com/data"), "a template in the host");
  assert.equal(listingUrlProblem("https://api.example.com:{port}/data"), "a template in the host");
  assert.equal(listingUrlProblem("https://169.254.169.254/latest/meta-data"), "a private address");
  assert.equal(listingUrlProblem("https://10.0.0.5/admin"), "a private address");
  assert.equal(listingUrlProblem("https://[::1]/"), "a private address");
  assert.equal(listingUrlProblem("https://[::ffff:127.0.0.1]/"), "a private address");
  assert.equal(listingUrlProblem("https://localhost/"), "a private host name");
  assert.equal(listingUrlProblem("https://user:pass@api.example.com/"), "credentials in the URL");
  assert.equal(listingUrlProblem(`${local}/x`, [local]), undefined, "the demo seller's own origin is exempt");
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("100.64.1.1"), false);
  assert.equal(isPublicAddress("fd00::1"), false);
});

test("such listings never make it into the catalog", async () => {
  assert.equal(toListing(item("https://{host}/steal"), network), undefined);
  assert.equal(toListing(item("http://169.254.169.254/latest"), network), undefined);
  assert.ok(toListing(item("https://api.example.com/{coin}"), network));
  // The testnet catalog read from the demo seller: its own listings stay, one pointing elsewhere inside is dropped.
  const catalog = { items: [item(`${local}/ok`), item("https://{host}/steal"), item("http://10.0.0.5/admin")] };
  const discovery = new Discovery({ demoSellerUrl: local, fetch: (async () => new Response(JSON.stringify(catalog))) as typeof fetch });
  const listings = await discovery.all(network);
  assert.deepEqual(listings.map((listing) => listing.url), [`${local}/ok`]);
});

test("a call connects only to public addresses, checked when it connects; no redirect is followed", async () => {
  const guarded = sellerFetch();
  const before = hits;
  await assert.rejects(guarded(`${local}/x`), /not https/);
  assert.equal(hits, before, "the internal service was never reached");
  // The connect-time lookup: a name is resolved, and any private address among its answers refuses the connection.
  const looked = await new Promise<{ code?: string }>((resolve) => publicOnlyLookup("localhost", { all: true }, (error) => resolve((error ?? {}) as { code?: string })));
  assert.equal(looked.code, "ENOTPUBLIC");
  // A DNS name for a private address passes the URL rules; the lookup is what stops it.
  await assert.rejects(guarded("https://127.0.0.1.nip.io/"), (error: unknown) => {
    const message = String((error as { message?: string }).message);
    // Offline, the name does not resolve at all: either way nothing on 127.0.0.1 is reached.
    return /not a public address|ENOTFOUND|EAI_AGAIN/.test(message);
  });
  // Through a trusted origin (the demo seller), the call goes as it is.
  const trusted = sellerFetch({ trusted: [local] });
  assert.equal(await (await trusted(`${local}/x`)).text(), "internal");
});

test("a public seller is reached, and a redirect from it is not followed", { skip: !process.env.X402_SSRF_LIVE }, async () => {
  const guarded = sellerFetch();
  const answer = await guarded("https://example.com/", { method: "GET" });
  assert.equal(answer.status, 200);
  await assert.rejects(guarded("https://httpbin.org/redirect-to?url=http%3A%2F%2F169.254.169.254%2F"), /redirect/);
});
