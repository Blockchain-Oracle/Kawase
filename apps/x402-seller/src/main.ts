// Kawase's testnet x402 demo seller (cards/marketplace.md "What if … Testnet"). Circle's catalog
// has no Arc Testnet listings, so this stands in: three paid money-data endpoints on Arc Testnet, priced like the
// mainnet ones (BlockRun's DefiLlama yields at $0.006), paid through Circle Gateway nanopayments with `@x402/express`'s
// paymentMiddleware and Circle's Gateway facilitator. Its data is real (DefiLlama, the ECB via Frankfurter, Arc's RPC).
// `/listings` publishes the endpoints in the Discovery API's shape; the api reads it as the testnet catalog.
// Deployable on Coolify as is (PORT, SELLER_PUBLIC_URL, SELLER_PAY_TO). Run: pnpm --filter @kawase/x402-seller dev
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { BatchFacilitatorClient, GatewayEvmScheme } from "@circle-fin/x402-batching/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { config } from "dotenv";
import express from "express";
import { createPublicClient, formatUnits, http, isAddress, parseUnits } from "viem";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const NETWORK = "eip155:5042002" as const;
const GATEWAY_FACILITATOR = "https://gateway-api-testnet.circle.com";
const DEFAULT_PORT = 4021;
const USDC_DECIMALS = 6;
/** Gateway authorizations stay valid at least 7 days (live `/v1/x402/supported`); the SDK uses this. */
const GATEWAY_TIMEOUT_S = 604_900;
const UPSTREAM_TIMEOUT_MS = 10_000;
const TOP_POOLS = 10;
const GWEI_DECIMALS = 9;
const MS_PER_SECOND = 1000;
const HTTP_BAD_GATEWAY = 502;

const port = Number(process.env.PORT ?? process.env.SELLER_PORT ?? DEFAULT_PORT);
const publicUrl = (process.env.SELLER_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
// Paid to Kawase's own testnet ops wallet unless told otherwise: never the buyer's address (Gateway refuses self_transfer).
const payTo = process.env.SELLER_PAY_TO ?? process.env.OPS_WALLET_ADDRESS_TESTNET;
if (!payTo || !isAddress(payTo)) throw new Error("SELLER_PAY_TO (or OPS_WALLET_ADDRESS_TESTNET) must be an address");

const arcTestnet = CHAIN_CONFIGS.arcTestnet;

type Endpoint = { path: string; price: string; description: string; category: string; tags: string[] };
const ENDPOINTS: Endpoint[] = [
  {
    path: "/api/defillama/yields",
    price: "0.006",
    description: "DefiLlama yield pools on Arc: the top pools by APY with TVL, project and asset",
    category: "FINANCIAL_ANALYSIS",
    tags: ["defillama", "yield", "apy", "pools", "arc", "defi"],
  },
  {
    path: "/api/fx/eur-usd",
    price: "0.002",
    description: "The euro to US dollar reference rate today (European Central Bank, via Frankfurter)",
    category: "FINANCIAL_ANALYSIS",
    tags: ["fx", "eur", "usd", "eurc", "usdc", "exchange rate", "ecb"],
  },
  {
    path: "/api/arc/network",
    price: "0.001",
    description: "Arc Testnet right now: the latest block, its time and the gas price in USDC",
    category: "INFRASTRUCTURE",
    tags: ["arc", "network", "gas", "block"],
  },
];

// The batching SDK types `resource.description` as required where @x402/core 2.28 has it optional: the same object
// at runtime, so the facilitator is passed as core's type.
const facilitator = new BatchFacilitatorClient({ url: GATEWAY_FACILITATOR }) as unknown as ConstructorParameters<typeof x402ResourceServer>[0];
const server = new x402ResourceServer(facilitator).register(NETWORK, new GatewayEvmScheme() as never);
const routes = Object.fromEntries(
  ENDPOINTS.map((endpoint) => [
    `GET ${endpoint.path}`,
    {
      accepts: { scheme: "exact", price: `$${endpoint.price}`, network: NETWORK, payTo },
      description: endpoint.description,
      mimeType: "application/json",
    },
  ]),
);

// Arc moved testnet's RPC to arc.io (docs.arc.io, 10-16); Circle's CHAIN_CONFIGS still carries the old host.
const ARC_TESTNET_RPC = "https://rpc.testnet.arc.io";
const chain = createPublicClient({ chain: arcTestnet.chain, transport: http(ARC_TESTNET_RPC) });
const upstream = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
  return response.json() as Promise<unknown>;
};

const app = express();
app.disable("x-powered-by");

/** Free: what this seller sells, in Circle's Discovery API shape (the api's testnet catalog). */
app.get("/listings", (_req, res) => {
  res.json({
    x402Version: 2,
    items: ENDPOINTS.map((endpoint) => ({
      resource: `${publicUrl}${endpoint.path}`,
      type: "http",
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: NETWORK,
          asset: arcTestnet.usdc,
          payTo,
          amount: parseUnits(endpoint.price, USDC_DECIMALS).toString(),
          maxTimeoutSeconds: GATEWAY_TIMEOUT_S,
          extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: arcTestnet.gatewayWallet },
        },
      ],
      metadata: {
        provider: {
          name: "Kawase Demo Seller",
          website: publicUrl,
          description: "Kawase's own testnet seller: real money data, paid with test USDC",
          category: endpoint.category,
          tags: endpoint.tags,
        },
        path: endpoint.path,
        method: "GET",
        description: endpoint.description,
        mimeType: "application/json",
        supportsVanillax402: false,
        supportsCircleGateway: true,
      },
    })),
    pagination: { limit: ENDPOINTS.length, offset: 0, total: ENDPOINTS.length },
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, network: NETWORK, payTo });
});

app.use(paymentMiddleware(routes, server));

app.get("/api/defillama/yields", async (_req, res) => {
  const data = (await upstream("https://yields.llama.fi/pools")) as { data?: { chain: string; project: string; symbol: string; apy: number | null; tvlUsd: number; pool: string }[] };
  const pools = (data.data ?? [])
    .filter((pool) => pool.chain.toLowerCase() === "arc")
    .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
    .slice(0, TOP_POOLS)
    .map((pool) => ({ project: pool.project, asset: pool.symbol, apy: pool.apy, tvlUsd: Math.round(pool.tvlUsd), pool: pool.pool }));
  res.json({ source: "DefiLlama", chain: "Arc", pools, at: new Date().toISOString() });
});

app.get("/api/fx/eur-usd", async (_req, res) => {
  const data = (await upstream("https://api.frankfurter.app/latest?from=EUR&to=USD")) as { date?: string; rates?: { USD?: number } };
  res.json({ source: "European Central Bank (Frankfurter)", pair: "EUR/USD", rate: data.rates?.USD ?? null, date: data.date ?? null });
});

app.get("/api/arc/network", async (_req, res) => {
  const [block, gasPrice] = await Promise.all([chain.getBlock(), chain.getGasPrice()]);
  res.json({
    source: "Arc Testnet RPC",
    block: block.number.toString(),
    at: new Date(Number(block.timestamp) * MS_PER_SECOND).toISOString(),
    gasPriceGwei: formatUnits(gasPrice, GWEI_DECIMALS),
  });
});

app.use((error: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(error);
  res.status(HTTP_BAD_GATEWAY).json({ error: "upstream", detail: error.message });
});

app.listen(port, () => {
  console.log(`x402 demo seller on ${publicUrl} (pays ${payTo} on ${NETWORK})`);
});
