// Live prices for the long/short markets (Abu's review 10-15: the terminal's price must move like Owarine's and
// Mitoshi's, not every 15 s). One WebSocket to Coinbase Exchange's public ticker (no key; BTC and ETH tick several times
// a second, EURC a few times a minute), subscribed per product while someone watches, each market mapped to the
// exchange's product: cirBTC → BTC-USD, WETH → ETH-USD, EURC → EURC-USDC. These move the chart; liquidation and the
// ticket keep the venue's own oracle (Aave's), which the markets read still carries. Pyth's Hermes needs a key now.
const COINBASE_WSS = "wss://ws-feed.exchange.coinbase.com";
const RECONNECT_MS = 3_000;
/** A listener hears a market at most this often (the exchange can tick many times a second). */
const THROTTLE_MS = 250;

/** The exchange product for a market's asset symbol; unknown markets have none (their price stays the oracle's). */
export function productFor(market: string): string | null {
  const symbol = market.toUpperCase().replace(/^CIR/, "");
  if (symbol === "BTC" || symbol === "WBTC" || symbol === "CBBTC") return "BTC-USD";
  if (symbol === "ETH" || symbol === "WETH") return "ETH-USD";
  if (symbol === "EURC") return "EURC-USDC";
  return null;
}

type Price = { price: number; at: number };
type Listener = (market: string, price: Price) => void;
type Watch = { market: string; product: string; listener: Listener; sentAt: number };

export class LiveTicker {
  private socket: WebSocket | undefined;
  private readonly last = new Map<string, Price>();
  private readonly watches = new Set<Watch>();
  private readonly subscribed = new Set<string>();
  private reconnect: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly log?: { warn: (fields: object, message: string) => void }) {}

  /** Watches `markets` (venue symbols); the snapshot is the last price of each that has one. */
  subscribe(markets: readonly string[], listener: Listener): { snapshot: Record<string, Price>; stop: () => void } {
    const added: Watch[] = [];
    const snapshot: Record<string, Price> = {};
    for (const market of markets) {
      const product = productFor(market);
      if (!product) continue;
      const watch = { market, product, listener, sentAt: 0 };
      this.watches.add(watch);
      added.push(watch);
      const known = this.last.get(product);
      if (known) snapshot[market] = known;
    }
    this.ensure();
    return {
      snapshot,
      stop: () => {
        for (const watch of added) this.watches.delete(watch);
        this.sync();
      },
    };
  }

  private products(): Set<string> {
    return new Set([...this.watches].map((watch) => watch.product));
  }

  private ensure() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      this.sync();
      return;
    }
    if (this.watches.size === 0 || this.reconnect) return;
    const socket = new WebSocket(COINBASE_WSS);
    this.socket = socket;
    this.subscribed.clear();
    socket.addEventListener("open", () => this.sync());
    socket.addEventListener("message", (event) => this.receive(String(event.data)));
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.subscribed.clear();
      if (this.watches.size === 0) return;
      this.reconnect = setTimeout(() => {
        this.reconnect = undefined;
        this.ensure();
      }, RECONNECT_MS);
    });
    socket.addEventListener("error", () => this.log?.warn({ source: "coinbase" }, "ticker: socket error"));
  }

  /** Subscribes to what is watched and drops what no one watches; the socket closes when nothing is. */
  private sync() {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const wanted = this.products();
    const add = [...wanted].filter((product) => !this.subscribed.has(product));
    const drop = [...this.subscribed].filter((product) => !wanted.has(product));
    if (add.length > 0) socket.send(JSON.stringify({ type: "subscribe", product_ids: add, channels: ["ticker"] }));
    if (drop.length > 0) socket.send(JSON.stringify({ type: "unsubscribe", product_ids: drop, channels: ["ticker"] }));
    for (const product of add) this.subscribed.add(product);
    for (const product of drop) this.subscribed.delete(product);
    if (wanted.size === 0) socket.close();
  }

  private receive(raw: string) {
    let message: { type?: string; product_id?: string; price?: string; time?: string; message?: string };
    try {
      message = JSON.parse(raw) as typeof message;
    } catch {
      return;
    }
    if (message.type === "error") {
      this.log?.warn({ source: "coinbase", reason: message.message }, "ticker: subscribe refused");
      return;
    }
    if (message.type !== "ticker" || !message.product_id || !message.price) return;
    const price = Number(message.price);
    if (!Number.isFinite(price) || price <= 0) return;
    const tick = { price, at: message.time ? Date.parse(message.time) : Date.now() };
    this.last.set(message.product_id, tick);
    const now = Date.now();
    for (const watch of this.watches) {
      if (watch.product !== message.product_id || now - watch.sentAt < THROTTLE_MS) continue;
      watch.sentAt = now;
      watch.listener(watch.market, tick);
    }
  }
}
