// Live trades on Arc mainnet (Abu's review 10-14: prices and charts must move as the market trades, like Mitoshi's).
// One WebSocket subscription to every Uniswap v2/v3/v4 `Swap` log on the chain (Arc mints a block about every half
// second; meme volume is a few swaps a minute per pool), decoded only for the pools someone is watching. A token's
// pool is its deepest Uniswap pair on DexScreener; its price in USD is the pool price times the quote token's USD
// price (DexScreener's priceUsd / priceNative, so a EURC pair is priced right). The last 30 minutes come from
// `eth_getLogs` on first request, timed by interpolating between two block timestamps (one call each, not one per log).
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
  webSocket,
} from "viem";

import { getNetwork } from "@kawase/networks";

import { arcTransport } from "../wallet/chain";
import { getJson } from "./cache";

const DEXSCREENER_TOKENS = "https://api.dexscreener.com/tokens/v1/arc";
/** Uniswap v4's PoolManager on Arc mainnet (read from the chain: the emitter of every v4 Swap, 10-14). */
const V4_POOL_MANAGER: Address = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const NATIVE: Address = "0x0000000000000000000000000000000000000000";
const NATIVE_DECIMALS = 18;
const MAINNET_WSS = "wss://rpc.mainnet.arc.io";
/** About 30 minutes of history at Arc's ~0.5 s blocks. */
const HISTORY_BLOCKS = 3_600n;
const HISTORY_MAX = 400;
/** A pool's spec (and its quote token's USD price) is re-read this often. */
const SPEC_TTL_MS = 120_000;
const RECONNECT_MS = 3_000;
/** 2^96, the fixed-point scale of `sqrtPriceX96`. */
const Q96 = 79_228_162_514_264_337_593_543_950_336;
const MS_PER_SECOND = 1000;
const TEN = 10;

const V2_SWAP = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
);
const V3_SWAP = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
);
const V4_SWAP = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);
const POOL_ABI = parseAbi(["function token0() view returns (address)"]);
const ERC20_ABI = parseAbi(["function decimals() view returns (uint8)"]);

export type LiveTrade = {
  token: Address;
  priceUsd: number;
  side: "buy" | "sell";
  amountUsd: number;
  tx: Hex;
  /** Milliseconds since the epoch. */
  at: number;
};

type Version = "v2" | "v3" | "v4";
type PoolSpec = {
  token: Address;
  version: Version;
  /** The pair contract (v2/v3) or the v4 pool id. */
  key: string;
  /** The watched token is the pool's token0 (else token1). */
  tokenIs0: boolean;
  dec0: number;
  dec1: number;
  quoteUsd: number;
  readAt: number;
};

type DsPair = {
  pairAddress: string;
  dexId: string;
  labels?: string[];
  baseToken: { address: string };
  quoteToken: { address: string };
  priceUsd?: string;
  priceNative?: string;
  liquidity?: { usd?: number };
};

const lower = (value: string) => value.toLowerCase();

export class LiveTrades {
  private readonly http: PublicClient;
  private readonly specs = new Map<string, PoolSpec>();
  private readonly byPool = new Map<string, Address>();
  private readonly history = new Map<string, LiveTrade[]>();
  private readonly listeners = new Set<(trade: LiveTrade) => void>();
  private unwatch: (() => void) | undefined;
  private reconnect: NodeJS.Timeout | undefined;
  private readonly wsUrl: string;

  constructor(options: { wsUrl?: string; alchemyKey?: string | undefined } = {}) {
    this.wsUrl = options.wsUrl ?? MAINNET_WSS;
    const chain = getNetwork("mainnet").viemChain;
    // The history reads (getLogs, two blocks) share the public RPC's limit with every wallet read: Alchemy steps in.
    this.http = createPublicClient({ chain, transport: arcTransport("mainnet", undefined, options.alchemyKey) }) as PublicClient;
  }

  /** Recent trades for these tokens (the last ~30 minutes), and live ones to `onTrade` until the returned stop. */
  async subscribe(tokens: readonly Address[], onTrade: (trade: LiveTrade) => void) {
    const wanted = new Set(tokens.map(lower));
    const listener = (trade: LiveTrade) => {
      if (wanted.has(lower(trade.token))) onTrade(trade);
    };
    this.listeners.add(listener);
    this.ensureSocket();
    const snapshot: Record<string, LiveTrade[]> = {};
    await Promise.all(
      tokens.map(async (token) => {
        snapshot[lower(token)] = await this.recent(token).catch(() => []);
      }),
    );
    return { snapshot, stop: () => this.listeners.delete(listener) };
  }

  /** The token's deepest Uniswap pool, with what decoding its swaps needs. Undefined when it has none. */
  private async spec(token: Address): Promise<PoolSpec | undefined> {
    const cached = this.specs.get(lower(token));
    if (cached && Date.now() - cached.readAt < SPEC_TTL_MS) return cached;
    const pairs = await getJson<DsPair[]>(`${DEXSCREENER_TOKENS}/${token}`);
    const pair = pairs
      .filter(
        (entry) =>
          entry.dexId === "uniswap" &&
          lower(entry.baseToken.address) === lower(token) &&
          ["v2", "v3", "v4"].some((v) => entry.labels?.includes(v)),
      )
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (!pair || !pair.priceUsd || !pair.priceNative) return undefined;
    const version = (["v4", "v3", "v2"] as const).find((v) => pair.labels?.includes(v))!;
    const base = getAddress(pair.baseToken.address);
    const quote = getAddress(pair.quoteToken.address);
    const token0 =
      version === "v4"
        ? lower(base) < lower(quote)
          ? base
          : quote
        : await this.http.readContract({
            address: getAddress(pair.pairAddress),
            abi: POOL_ABI,
            functionName: "token0",
          });
    const token1 = lower(token0) === lower(base) ? quote : base;
    const [dec0, dec1] = await Promise.all([this.decimals(token0), this.decimals(token1)]);
    const spec: PoolSpec = {
      token: getAddress(token),
      version,
      key: lower(pair.pairAddress),
      tokenIs0: lower(token0) === lower(base),
      dec0,
      dec1,
      quoteUsd: Number(pair.priceUsd) / Number(pair.priceNative),
      readAt: Date.now(),
    };
    this.specs.set(lower(token), spec);
    this.byPool.set(spec.key, spec.token);
    return spec;
  }

  private async decimals(address: Address) {
    if (lower(address) === NATIVE) return NATIVE_DECIMALS;
    return Number(await this.http.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }));
  }

  private async recent(token: Address): Promise<LiveTrade[]> {
    const held = this.history.get(lower(token));
    if (held) return held;
    const spec = await this.spec(token);
    if (!spec) return [];
    const latest = await this.http.getBlockNumber();
    const from = latest - HISTORY_BLOCKS;
    const [logs, newest, oldest] = await Promise.all([
      spec.version === "v4"
        ? this.http.getLogs({
            address: V4_POOL_MANAGER,
            event: V4_SWAP,
            args: { id: spec.key as Hex },
            fromBlock: from,
            toBlock: latest,
          })
        : this.http.getLogs({
            address: spec.key as Address,
            event: spec.version === "v3" ? V3_SWAP : V2_SWAP,
            fromBlock: from,
            toBlock: latest,
          }),
      this.http.getBlock({ blockNumber: latest }),
      this.http.getBlock({ blockNumber: from }),
    ]);
    const span = Number(latest - from);
    const msPerBlock = span > 0 ? (Number(newest.timestamp - oldest.timestamp) * MS_PER_SECOND) / span : 0;
    const timeOf = (block: bigint) => Number(newest.timestamp) * MS_PER_SECOND - Number(latest - block) * msPerBlock;
    const trades = (logs as Log[])
      .map((log) => this.decode(spec, log, timeOf(log.blockNumber ?? latest)))
      .filter((trade): trade is LiveTrade => trade !== undefined)
      .slice(-HISTORY_MAX);
    this.history.set(lower(token), trades);
    return trades;
  }

  /** One swap log as a trade in the token, or undefined when it can't be priced. */
  private decode(spec: PoolSpec, log: Log, at: number): LiveTrade | undefined {
    try {
      let base: number;
      let quote: number;
      let price: number;
      let buy: boolean;
      const scale0 = TEN ** spec.dec0;
      const scale1 = TEN ** spec.dec1;
      if (spec.version === "v2") {
        const { args } = decodeEventLog({ abi: [V2_SWAP], data: log.data, topics: log.topics });
        const in0 = Number(args.amount0In) / scale0;
        const in1 = Number(args.amount1In) / scale1;
        const out0 = Number(args.amount0Out) / scale0;
        const out1 = Number(args.amount1Out) / scale1;
        base = spec.tokenIs0 ? in0 + out0 : in1 + out1;
        quote = spec.tokenIs0 ? in1 + out1 : in0 + out0;
        price = base > 0 ? quote / base : 0;
        buy = spec.tokenIs0 ? out0 > 0 : out1 > 0;
      } else {
        const { args } = decodeEventLog({
          abi: [spec.version === "v3" ? V3_SWAP : V4_SWAP],
          data: log.data,
          topics: log.topics,
        });
        const a0 = Number(args.amount0) / scale0;
        const a1 = Number(args.amount1) / scale1;
        const ratio = Number(args.sqrtPriceX96) / Q96;
        // token0's price in token1, in whole units.
        const p01 = ratio * ratio * TEN ** (spec.dec0 - spec.dec1);
        price = spec.tokenIs0 ? p01 : p01 > 0 ? 1 / p01 : 0;
        base = Math.abs(spec.tokenIs0 ? a0 : a1);
        quote = Math.abs(spec.tokenIs0 ? a1 : a0);
        const baseDelta = spec.tokenIs0 ? a0 : a1;
        // v3 amounts are the pool's (negative = out to the trader); v4 amounts are the trader's (positive = received).
        buy = spec.version === "v3" ? baseDelta < 0 : baseDelta > 0;
      }
      if (!(price > 0) || !Number.isFinite(price)) return undefined;
      return {
        token: spec.token,
        priceUsd: price * spec.quoteUsd,
        side: buy ? "buy" : "sell",
        amountUsd: quote * spec.quoteUsd,
        tx: (log.transactionHash ?? "0x") as Hex,
        at,
      };
    } catch {
      return undefined;
    }
  }

  /** The one subscription: every Swap on the chain, kept only for watched pools; reopened if it drops. */
  private ensureSocket() {
    if (this.unwatch || this.reconnect) return;
    const chain = getNetwork("mainnet").viemChain;
    const client = createPublicClient({
      chain,
      transport: webSocket(this.wsUrl, { keepAlive: true, reconnect: true }),
    });
    this.unwatch = client.watchEvent({
      events: [V2_SWAP, V3_SWAP, V4_SWAP],
      onLogs: (logs) => {
        for (const log of logs) this.receive(log as Log);
      },
      onError: () => {
        this.unwatch?.();
        this.unwatch = undefined;
        this.reconnect = setTimeout(() => {
          this.reconnect = undefined;
          if (this.listeners.size > 0) this.ensureSocket();
        }, RECONNECT_MS);
      },
    });
  }

  private receive(log: Log) {
    const address = lower(log.address);
    const key = address === V4_POOL_MANAGER ? lower((log.topics[1] ?? "") as string) : address;
    const token = this.byPool.get(key);
    if (!token) return;
    const spec = this.specs.get(lower(token));
    if (!spec) return;
    const trade = this.decode(spec, log, Date.now());
    if (!trade) return;
    const held = this.history.get(lower(token));
    if (held) {
      held.push(trade);
      if (held.length > HISTORY_MAX) held.splice(0, held.length - HISTORY_MAX);
    }
    for (const listener of this.listeners) listener(trade);
  }
}
