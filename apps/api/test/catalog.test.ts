// The marketplace read model: Circle's discovery collapsed into tools with counts, categories, price per call,
// "calls per $1", 1P/3P and the rail. The first test runs on a catalog shaped like the live one (a reseller's 954-endpoint
// tool, a seller's own API, an RPC proxy); the second reads the real discovery API (public, keyless) and prints what it finds.
import assert from "node:assert/strict";
import { test } from "node:test";

import { Discovery } from "@kawase/integrations-x402";
import { getNetwork } from "@kawase/networks";

import { CatalogService } from "../src/marketplace/catalog";

const mainnet = getNetwork("mainnet");
const USDC = mainnet.addresses.usdc;
const PAY_TO = "0x52Ab53912D37759B2ad364f22dD06B16714b6C06";

type Item = { resource: string; accepts: unknown[]; metadata: Record<string, unknown> };
function item(resource: string, provider: { name: string; website: string; category: string }, amount: string, gateway: boolean, description = "An endpoint"): Item {
  return {
    resource,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:5042",
        asset: USDC,
        payTo: PAY_TO,
        amount,
        extra: gateway ? { name: "GatewayWalletBatched", version: "1", verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" } : { name: "USDC", version: "2", assetTransferMethod: "eip3009" },
      },
    ],
    metadata: { provider: { ...provider, description: `${provider.name} tools`, tags: ["x402"] }, method: "GET", description },
  };
}

const AISA = { name: "AIsa API", website: "https://aisa.one", category: "SOCIAL_INTELLIGENCE" };
const catalogOf = (items: Item[]) => new CatalogService(new Discovery({ fetch: (async () => new Response(JSON.stringify({ items, pagination: { total: items.length } }))) as typeof fetch }));

test("catalog: a reseller's endpoints collapse into upstream tools, sellers keep their own, counts and prices add up", async () => {
  const items: Item[] = [
    ...["douyin", "douyin", "tiktok"].map((platform, index) => item(`https://api.aisa.one/apis/v2/tikhub/${platform}/endpoint_${index}`, AISA, "100000", true)),
    item("https://api.aisa.one/apis/v2/exa/answer", { ...AISA, category: "FINANCIAL_ANALYSIS" }, "100000", true, "Get a direct, cited answer"),
    item("https://aero.lonestaroracle.xyz/pool", { name: "LoneStarOracle", website: "https://lonestaroracle.xyz", category: "FINANCIAL_ANALYSIS" }, "50000", false),
    item("https://africa.lonestaroracle.xyz/pulse", { name: "LoneStarOracle", website: "https://lonestaroracle.xyz", category: "FINANCIAL_ANALYSIS" }, "8500", false),
    item("https://x402.quicknode.com/base-mainnet/", { name: "Quicknode", website: "https://quicknode.com", category: "INFRASTRUCTURE" }, "100", false, "JSON-RPC proxy"),
    item("https://x402.quicknode.com/arbitrum-mainnet/", { name: "Quicknode", website: "https://quicknode.com", category: "INFRASTRUCTURE" }, "100", false, "JSON-RPC proxy"),
  ];
  const catalog = catalogOf(items);
  const all = await catalog.list(mainnet, {});
  assert.deepEqual([all.totals.tools, all.totals.endpoints], [4, 8], "tikhub, exa, LoneStarOracle, Quicknode");
  const tikhub = all.tools.find((tool) => tool.key === "api.aisa.one~tikhub")!;
  assert.deepEqual([tikhub.endpoints, tikhub.party, tikhub.gatewayOnly, tikhub.callsPerDollar, tikhub.category], [3, "third", true, 10, "SOCIAL"]);
  assert.deepEqual(tikhub.groups, [{ key: "douyin", name: "douyin", endpoints: 2 }, { key: "tiktok", name: "tiktok", endpoints: 1 }]);
  const exa = all.tools.find((tool) => tool.key === "api.aisa.one~exa")!;
  assert.equal(exa.category, "SEARCH", "AIsa files Exa under FINANCIAL_ANALYSIS; the tool override corrects it");
  const lonestar = all.tools.find((tool) => tool.key === "lonestaroracle.xyz")!;
  assert.deepEqual([lonestar.party, lonestar.endpoints, lonestar.price, lonestar.callsPerDollar, lonestar.gatewayOnly], ["first", 2, "8500", 117, false]);
  assert.equal(all.tools.find((tool) => tool.key === "x402.quicknode.com")!.groups.length, 2);
  // Real logos from the identity registry: a reseller's tool carries its own mark (Exa) or none (Tikhub), never the
  // reseller's; the seller's mark rides along as the badge; a seller's own API takes the seller's mark.
  assert.deepEqual([exa.mark, exa.providerMark], ["provider:exa", "provider:aisa"]);
  assert.deepEqual([tikhub.mark, tikhub.providerMark], [null, "provider:aisa"]);
  assert.deepEqual([all.tools.find((tool) => tool.key === "x402.quicknode.com")!.mark, lonestar.mark], ["provider:quicknode", null]);

  // Filters: categories keep counting what they would give; price and rail narrow the tools.
  const cheap = await catalog.list(mainnet, { maxPrice: 10_000n });
  assert.deepEqual(cheap.tools.map((tool) => tool.name).sort(), ["LoneStarOracle", "Quicknode"]);
  const plain = await catalog.list(mainnet, { rail: "eip3009", category: "INFRASTRUCTURE" });
  assert.deepEqual(plain.tools.map((tool) => tool.name), ["Quicknode"]);
  assert.ok(plain.categories.some((entry) => entry.id === "FINANCIAL"), "chips still show the other categories");
  const search = await catalog.list(mainnet, { q: "tikhub douyin" });
  assert.equal(search.tools[0]?.name, "TikHub", "named as the vendor writes it");

  const detail = (await catalog.tool(mainnet, "api.aisa.one~tikhub", { group: "douyin" }))!;
  assert.deepEqual([detail.page.total, detail.endpoints.length, detail.endpoints[0]!.priceDisplay], [2, 2, "0.10 USDC"]);
  assert.equal(await catalog.tool(mainnet, "nobody", {}), undefined);
});

test("catalog: the live discovery API groups into tools with counts per category (public read)", { timeout: 120_000 }, async () => {
  const catalog = new CatalogService(new Discovery({}));
  const view = await catalog.list(mainnet, { limit: 10 });
  assert.ok(view.totals.endpoints > 1_000, `endpoints on Arc: ${view.totals.endpoints}`);
  assert.ok(view.totals.tools < view.totals.endpoints / 4, "collapsed far below the endpoint count");
  console.log(`live catalog: ${view.totals.endpoints} endpoints -> ${view.totals.tools} tools, read ${view.readAt}`);
  console.log("categories (tools / endpoints):", view.categories.map((entry) => `${entry.id} ${entry.tools}/${entry.endpoints}`).join(", "));
  for (const tool of view.tools) console.log(`  ${tool.name} [${tool.key}] ${tool.party === "third" ? "3P" : "1P"} ${tool.category} ${tool.endpoints} endpoints, from ${Number(tool.price) / 1e6} USDC (${tool.callsPerDollar}/$1), ${tool.gatewayOnly ? "Gateway only" : tool.rails.join("+")}, mark ${tool.mark ?? "-"} / seller ${tool.providerMark ?? "-"}`);
  const search = await catalog.list(mainnet, { q: "weather", limit: 3 });
  console.log(`search "weather": ${search.page.total} tools, top ${search.tools.map((tool) => tool.name).join(", ")}`);
  const tikhub = view.tools.find((tool) => tool.key === "api.aisa.one~tikhub");
  assert.ok(tikhub && tikhub.endpoints > 900 && tikhub.groups.length > 10, "tikhub is one tool with its platforms inside");
});
