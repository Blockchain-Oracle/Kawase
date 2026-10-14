// The marketplace catalog through the api, as the screens will call it: a guest (no account) reads
// `GET /marketplace/catalog?category=&q=&maxPrice=` and `GET /marketplace/catalog/:key` over Circle's live discovery API
// (public, keyless). Read only: nothing here pays. Skipped without DATABASE_URL (the guest session is a row).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";

import type { CatalogToolDetail, CatalogView } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { Discovery } from "@kawase/integrations-x402";

import { circleAgentWallets } from "../src/marketplace/agent-wallets";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
const live = Boolean(process.env.DATABASE_URL && process.env.CIRCLE_TEST_API_KEY);

test("catalog over http: a guest browses the live marketplace as tools, by category, search and price", { skip: !live, timeout: 180_000 }, async () => {
  const env = loadApiEnv();
  const { app, db, close } = testApp(fakeTurnkey({}, {}), createChains(env), undefined, undefined, undefined, undefined, undefined, { agentWallets: circleAgentWallets(env), discovery: new Discovery({}) });
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device: { platform: "web", installationId: `catalog-${randomUUID()}` } }));
  await expectStatus(guest, 201, "guest");
  const { token, user } = (await guest.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const get = async <T>(path: string) => {
    const response = await app.request(path, { headers: { authorization: `Bearer ${token}` } });
    await expectStatus(response, 200, path);
    return (await response.json()) as T;
  };

  const all = await get<CatalogView>("/marketplace/catalog?network=mainnet&limit=8");
  assert.ok(all.totals.endpoints > 1_000 && all.totals.tools < all.totals.endpoints / 4, "endpoints collapse into tools");
  assert.ok(all.categories.length >= 5 && all.categories.every((entry) => entry.tools > 0 && entry.endpoints >= entry.tools));
  console.log(`GET /marketplace/catalog: ${all.totals.endpoints} endpoints -> ${all.totals.tools} tools (read ${all.readAt}, stale ${all.stale})`);
  console.log(`  categories (tools/endpoints): ${all.categories.map((entry) => `${entry.id} ${entry.tools}/${entry.endpoints}`).join(", ")}`);
  for (const tool of all.tools) {
    console.log(`  ${tool.name} · ${tool.provider.name} · ${tool.party === "first" ? "1P" : "3P"} · ${tool.category} · ${tool.endpoints} endpoints · ${Number(tool.price) / 1e6} USDC/call · ≈${tool.callsPerDollar} calls/$1 · ${tool.gatewayOnly ? "Gateway only" : tool.rails.join("+")} · mark ${tool.mark ?? "-"}`);
  }

  // A category with a price cap and a search: what the screen's chips, slider and search box send.
  const cheapSocial = await get<CatalogView>("/marketplace/catalog?network=mainnet&category=SOCIAL&maxPrice=100000&limit=5");
  assert.ok(cheapSocial.tools.length > 0 && cheapSocial.tools.every((tool) => tool.category === "SOCIAL" && BigInt(tool.price) <= 100_000n));
  assert.ok(cheapSocial.categories.length > 1, "the other chips keep their counts");
  console.log(`  SOCIAL ≤ $0.10: ${cheapSocial.page.total} tools, top ${cheapSocial.tools.map((tool) => `${tool.name} (${tool.endpoints})`).join(", ")}`);
  const search = await get<CatalogView>("/marketplace/catalog?network=mainnet&q=search&limit=5");
  console.log(`  q=search: ${search.page.total} tools, top ${search.tools.map((tool) => tool.name).join(", ")}`);
  assert.ok(search.page.total > 0);

  // One tool opened: its sub-groups and a page of endpoints, cheapest first.
  const top = all.tools[0]!;
  const detail = await get<CatalogToolDetail>(`/marketplace/catalog/${encodeURIComponent(top.key)}?network=mainnet&limit=3${top.groups[0] ? `&group=${encodeURIComponent(top.groups[0].key)}` : ""}`);
  assert.equal(detail.tool.key, top.key);
  assert.ok(detail.endpoints.length > 0);
  console.log(`  ${top.name} / ${top.groups[0]?.name ?? "all"}: ${detail.page.total} endpoints, first ${detail.endpoints[0]!.method} ${detail.endpoints[0]!.url} ${detail.endpoints[0]!.priceDisplay}`);
  const missing = await app.request("/marketplace/catalog/nobody.example?network=mainnet", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(missing.status, 404);
  // A key with a literal "%" is an unknown tool, not a server error (Hono has already decoded the param).
  const percent = await app.request("/marketplace/catalog/%25?network=mainnet", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(percent.status, 404);
});
