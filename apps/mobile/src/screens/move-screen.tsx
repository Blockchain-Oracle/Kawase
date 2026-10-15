// Move between chains, on the Senryo kit (plan F; surfaces.md "Bridge"): the one cross-chain screen — /bridge redirects
// here, and every bridge Kawase runs is a row on its RouteList. Out of Arc to anyone on another chain, or Bring to Arc.
// It asks only what it cannot infer: the chain (a grid of real marks, only chains with a working route on this
// network; for Bring to Arc, what is waiting on each), the asset (what they hold on Arc, USDC first; for Bring to Arc
// what is at their address there), the amount (the kit's AmountPad with 1/4 1/2 3/4 All), and for a move out who
// receives it — themselves unless they pick a contact (one with an address saved on that chain is paid there), an
// @handle or an address. Review is the move ticket: the bridges racing on the RouteList, slide to confirm, the four
// steps, the receipt. The intent is journalled before the yes, so a kill mid-move reopens on the same move (read only).
// Desktop (a window ≥ 1024): two columns, the ticket on the left, the live race (or the version's routes) on the right.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { formatUnits, parseUnits } from "viem";

import type { CrossChainRequest, RouteRaceRequest } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { useWide } from "@kawase/ui-native/lib/wide";

import { AmountPad, Button, Icon, Panel, SectionLabel, SIZE, SPACE, TIMING, TYPE, useTheme } from "@/components/kit";
import { ArrowLeftRight } from "lucide-react-native";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { type Blocker, BlockedCta } from "@/components/tx";
import { ChainGrid, chainName, destinationMark, useDestinations } from "@/crosschain/chain-grid";
import { useAssetMoney } from "@/crosschain/move-copy";
import { MoveTicket } from "@/crosschain/move-ticket";
import { moveEnded } from "@/crosschain/move-tx";
import { RecipientField } from "@/crosschain/recipient-field";
import { useCrossChain, useElsewhere } from "@/crosschain/use-crosschain";
import { fire } from "@/feedback/fire";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { moveRace } from "@/routes/from-draft";
import { useTicketJournal } from "@/routes/intent-tx";
import { LiveRace } from "@/routes/live-race";
import { QuotePreview } from "@/routes/quote-preview";
import { RouteList } from "@/routes/route-list";
import { TicketHeader } from "@/routes/ticket-header";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { TicketPill } from "@/swap/token-button";
import { TradeSwitch } from "@/swap/trade-switch";

const USDC_DECIMALS = 6;
const NOTHING = 0n;
/** Assets offered for a move out: the largest holdings on Arc. */
const ASSET_CHOICES = 6;
const MAX_FRACTION = 6;
const TICKET_COLUMN = 460;
/** Below this the two pills can't hold their label and a chain's name side by side. */
const TICKET_MIN = 360;
/** The race column's least width, and the page width that holds both columns side by side. */
const RACE_MIN = 340;
const BOTH_SIDES = 2;
const TWO_COLUMNS_MIN = TICKET_MIN + RACE_MIN + SPACE.lg + SPACE.inset * BOTH_SIDES;
const HALF = 2;

export type MovePrefill = { direction?: "out" | "in" | undefined; chain?: string | undefined; amount?: string | undefined; recipient?: string | undefined; asset?: string | undefined };

type Asset = { symbol: string; decimals: number };

const units = (value: string | undefined, decimals: number) => {
  try {
    return value ? parseUnits(value, decimals) : NOTHING;
  } catch {
    return NOTHING;
  }
};

export function MoveScreen({ prefill }: { prefill: MovePrefill }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const wideWindow = useWide();
  // Two columns only when the page holds both the ticket and the race at their least (see the swap screen).
  const [pageWidth, setPageWidth] = React.useState(0);
  const wide = wideWindow && pageWidth >= TWO_COLUMNS_MIN;
  const fund = useFund();
  const money = useAssetMoney();
  const { portfolio } = usePortfolio();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const elsewhere = useElsewhere();
  const destinations = useDestinations();
  const controller = useCrossChain();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const journal = useTicketJournal("bridge", network, status === "account" ? user?.id : undefined);
  const [direction, setDirection] = React.useState<"out" | "in">(prefill.direction ?? "out");
  const [chain, setChain] = React.useState<string | undefined>(prefill.chain);
  const [asset, setAsset] = React.useState<Asset>({ symbol: prefill.asset ?? "USDC", decimals: USDC_DECIMALS });
  const [amount, setAmount] = React.useState<bigint>(() => units(prefill.amount, USDC_DECIMALS));
  const [recipient, setRecipient] = React.useState(prefill.recipient ?? "");
  const [creating, setCreating] = React.useState(false);
  const [picking, setPicking] = React.useState(false);

  const waiting = React.useMemo(() => elsewhere?.chains ?? [], [elsewhere]);
  const onChain = waiting.filter((row) => row.key === chain);
  const held = (portfolio?.assets ?? []).filter((holding) => !holding.hidden && BigInt(holding.balance) > NOTHING).slice(0, ASSET_CHOICES);
  // A link that named the asset by its Arc address (Send, a token page, Withdraw) gets that token's own decimals.
  const named = (portfolio?.assets ?? []).find((holding) => holding.token.address.toLowerCase() === asset.symbol.toLowerCase());
  React.useEffect(() => {
    if (named && named.token.decimals !== asset.decimals) setAsset({ symbol: named.token.address, decimals: named.token.decimals });
  }, [named, asset.decimals]);
  // Bring to Arc from where the money is: the chain holding the most, unless one was named.
  React.useEffect(() => {
    if (direction === "in" && !chain && waiting[0]) setChain(waiting[0].key);
  }, [direction, chain, waiting]);
  // A chain the routes cannot reach on this network is never kept selected.
  React.useEffect(() => {
    if (chain && destinations.status === "ready" && !destinations.list.some((entry) => entry.id === chain)) setChain(undefined);
  }, [chain, destinations.status, destinations.list]);

  // A move left in flight (the app was closed after the yes): read it back, never send it again.
  const intent = controller.intent;
  const setIntent = controller.set;
  React.useEffect(() => {
    if (!journal.resumable || intent) return;
    let live = true;
    api.crosschain
      .get(journal.resumable)
      .then(({ intent: found }) => live && setIntent(found))
      .catch(() => journal.forget(journal.resumable!));
    return () => {
      live = false;
    };
  }, [journal, intent, setIntent]);
  React.useEffect(() => {
    if (intent && moveEnded(intent)) journal.forget(intent.id);
  }, [intent, journal]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const back = () => {
    if (!intent) leave();
    else if (["submitted", "working", "input_required", "auth_required", "ready_for_approval"].includes(intent.state)) {
      void controller.cancel();
      controller.reset();
    } else leave();
  };

  const decimal = formatUnits(amount, asset.decimals);
  const request: CrossChainRequest =
    direction === "in" ? { direction, source: chain ?? null, asset: asset.symbol, amount: decimal } : { direction, destination: chain ?? null, asset: asset.symbol, amount: decimal, recipient: recipient.trim() || null };
  const review = async () => {
    if (status !== "account") {
      signIn.open();
      return;
    }
    setCreating(true);
    try {
      const { intent: created } = await api.crosschain.create(request);
      controller.set(created);
    } catch {
      fire("fail", { sound: "error" });
    } finally {
      setCreating(false);
    }
  };

  const balance =
    direction === "out"
      ? (() => {
          const holding = (portfolio?.assets ?? []).find((entry) => entry.token.symbol === asset.symbol || entry.token.address.toLowerCase() === asset.symbol.toLowerCase());
          return holding ? BigInt(holding.balance) : portfolio ? NOTHING : undefined;
        })()
      : (() => {
          const row = onChain.find((entry) => entry.asset === asset.symbol);
          return row ? BigInt(row.balance) : undefined;
        })();
  const short = amount > NOTHING && balance !== undefined && amount > balance;
  const blocker: Blocker | null = !chain
    ? { label: direction === "in" ? t("move.pickSource") : t("move.pickChain") }
    : amount === NOTHING
      ? { label: t("move.needAmount") }
      : status !== "account"
        ? { label: t("move.needAmount"), fix: { kind: "sign-in" } }
        : short
          ? { label: t("move.notEnough", { asset: assetLabel(asset, held) }), ...(direction === "out" ? { fix: { kind: "add-money" as const } } : {}) }
          : null;
  // Quoted for any amount, short of balance included (what it would deliver, before "Add money"), like Swap.
  const raceRequest: RouteRaceRequest | null = direction === "out" && chain && amount > NOTHING ? { kind: "bridge", destination: chain, amount: decimal, asset: asset.symbol, recipient: recipient.trim() || null } : null;
  const chainMark = (() => {
    const entry = destinations.list.find((destination) => destination.id === chain);
    return entry ? destinationMark(entry) : undefined;
  })();

  const assetChips =
    (direction === "out" ? held.length > 1 : onChain.length > 1) ? (
      <View style={styles.section}>
        <SectionLabel>{t("move.asset")}</SectionLabel>
        <View style={styles.chips}>
          {direction === "out"
            ? held.map((holding) => {
                const on = asset.symbol === holding.token.symbol || asset.symbol === holding.token.address;
                return (
                  <Chip
                    key={holding.token.address}
                    on={on}
                    label={holding.token.symbol}
                    mark={<TokenMark token={holding.token} size={SIZE.markChip} />}
                    onPress={() => {
                      setAsset({ symbol: holding.token.symbol === "USDC" ? "USDC" : holding.token.address, decimals: holding.token.decimals });
                      setAmount(NOTHING);
                    }}
                  />
                );
              })
            : onChain.map((row) => (
                <Chip
                  key={`${row.key}:${row.asset}`}
                  on={asset.symbol === row.asset}
                  label={`${row.asset} · ${money(row.balance, { symbol: "", decimals: row.decimals ?? USDC_DECIMALS }).trim()}`}
                  onPress={() => {
                    setAsset({ symbol: row.asset, decimals: row.decimals ?? USDC_DECIMALS });
                    setAmount(BigInt(row.balance));
                  }}
                />
              ))}
        </View>
      </View>
    ) : null;

  // Select first, like the swap: Arc on one side, the other chain a pill that opens the chain picker; the flip turns
  // "Send out" into "Bring to Arc". Routes show only once there is a chain and an amount to race.
  const turn = (next: "out" | "in") => {
    setDirection(next);
    setChain(undefined);
    setAsset({ symbol: "USDC", decimals: USDC_DECIMALS });
    setAmount(NOTHING);
    fire("tick");
  };
  const picked = (id: string) => {
    setChain(id);
    setPicking(false);
    const there = waiting.find((row) => row.key === id && row.asset === "USDC") ?? waiting.find((row) => row.key === id);
    if (direction === "in" && there) {
      setAsset({ symbol: there.asset, decimals: there.decimals ?? USDC_DECIMALS });
      setAmount(BigInt(there.balance));
    }
  };
  const chosen = destinations.list.find((entry) => entry.id === chain);
  const arcSide = <TicketPill mark={<Mark entity={arcIdentity(network).chain} size={SIZE.markToken} />} label={direction === "in" ? t("move.to") : t("move.from")} value={testnet ? t("network.arcTestnet") : t("network.arc")} />;
  const chainSide = (
    <TicketPill
      {...(chosen ? { mark: <Mark entity={destinationMark(chosen)} size={SIZE.markToken} /> } : {})}
      label={direction === "in" ? t("move.from") : t("move.to")}
      value={chosen ? chainName(chosen) : t("move.choose")}
      placeholder={!chosen}
      onPress={() => setPicking(true)}
    />
  );
  const pair = (
    <View style={styles.pair}>
      {direction === "out" ? arcSide : chainSide}
      <Pressable accessibilityRole="button" accessibilityLabel={t("swap.flip")} onPress={() => turn(direction === "out" ? "in" : "out")} style={[styles.flip, { backgroundColor: color.raised2 }]}>
        <Icon icon={ArrowLeftRight} size={SIZE.iconSm} />
      </Pressable>
      {direction === "out" ? chainSide : arcSide}
    </View>
  );
  const picker = picking ? (
    <Sheet onClose={() => setPicking(false)} closeLabel={t("common.close")}>
      <SheetHeading title={direction === "in" ? t("move.pickSource") : t("move.pickChain")} />
      <ChainGrid
        destinations={destinations.list}
        status={destinations.status}
        onRetry={destinations.retry}
        selected={chain}
        onSelect={picked}
        {...(direction === "in" ? { waiting, amountOf: (row: (typeof waiting)[number]) => money(row.balance, { symbol: row.asset, decimals: row.decimals ?? USDC_DECIMALS }) } : {})}
      />
    </Sheet>
  ) : null;

  const form = (
    <View style={styles.grow}>
      <ScrollView style={styles.grow} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {pair}
        {direction === "out" && chain ? (
          <View style={styles.section}>
            <SectionLabel>{t("move.recipient")}</SectionLabel>
            <RecipientField value={recipient} onChange={setRecipient} chain={chain} chainMark={chainMark} />
          </View>
        ) : null}
        {assetChips}
        <AmountPad
          value={amount}
          onChange={setAmount}
          decimals={asset.decimals}
          fraction={Math.min(asset.decimals, MAX_FRACTION)}
          prefix=""
          suffix={assetLabel(asset, held)}
          {...(balance !== undefined && balance > NOTHING ? { balance } : {})}
          problem={short ? t("move.notEnough", { asset: assetLabel(asset, held) }) : null}
          note={direction === "in" ? t("move.bringNote") : undefined}
          label={t("move.amount")}
        />
        {/* What arrives, before anything else is asked (signed out too): the bridges' race, folded to its winner. */}
        {!wide && raceRequest ? <QuotePreview request={raceRequest} /> : null}
      </ScrollView>
      <View style={styles.footer}>
        {blocker?.fix?.kind === "sign-in" ? (
          <Button label={t("ticket.signInBridge")} onPress={() => signIn.open()} />
        ) : blocker ? (
          <BlockedCta
            blocker={blocker}
            onFix={(fix) => {
              if (fix.kind === "sign-in") signIn.open();
              else if (fix.kind === "add-money") fund.open();
            }}
          />
        ) : (
          <Button label={creating ? t("move.pricing") : t("move.review")} loading={creating} onPress={() => void review()} />
        )}
      </View>
    </View>
  );

  const ticket = intent ? (
    <ScrollView style={styles.grow} contentContainerStyle={styles.scroll}>
      <MoveTicket controller={controller} hideRoutes={wide} onMark={journal.mark} onDone={leave} onRetry={() => controller.reset()} />
    </ScrollView>
  ) : null;

  const body = (
    <Animated.View key={intent ? "ticket" : "form"} entering={reduced ? undefined : FadeIn.duration(TIMING.sheetEnter)} style={styles.grow}>
      {ticket ?? form}
    </Animated.View>
  );
  const draftRace = intent?.draft ? moveRace(intent.draft) : null;
  const open = intent ? ["submitted", "working", "input_required", "auth_required", "ready_for_approval"].includes(intent.state) : false;

  return (
    <View style={[styles.page, { backgroundColor: color.ground }]} onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}>
      <TicketHeader title={direction === "in" ? t("move.bringTitle") : t("move.title")} onBack={back} testnet={testnet} />
      {!intent && direction === "out" ? (
        <View style={styles.switch}>
          <TradeSwitch current="bridge" />
        </View>
      ) : null}
      {wide && (draftRace || raceRequest) ? (
        <View style={styles.columns}>
          <View style={styles.ticketColumn}>{body}</View>
          <Animated.View entering={reduced ? undefined : FadeIn.duration(TIMING.sheetEnter)} style={styles.grow}>
            <Panel style={styles.raceColumn}>
              <ScrollView contentContainerStyle={styles.raceScroll}>
                {draftRace && intent?.draft ? (
                  <RouteList race={draftRace} selected={intent.draft.chosen} readOnly={!open || controller.busy} onSelect={(route) => void controller.revise({ route: route as NonNullable<typeof intent.draft>["chosen"] })} />
                ) : (
                  <LiveRace request={raceRequest} idleTitle={direction === "in" ? t("move.raceIdleInTitle") : t("move.raceIdleTitle")} idleBody={direction === "in" ? t("move.raceIdleInBody") : t("move.raceIdleBody")} />
                )}
              </ScrollView>
            </Panel>
          </Animated.View>
        </View>
      ) : wideWindow ? (
        // Nothing to race yet: the ticket alone, centred; the bridges come in beside it once there is a chain and an amount.
        <View style={styles.solo}>{body}</View>
      ) : (
        body
      )}
      {picker}
    </View>
  );
}

/** The asset's symbol for words (an Arc address resolves to its holding's symbol). */
function assetLabel(asset: Asset, held: readonly { token: { address: string; symbol: string } }[]) {
  return asset.symbol.startsWith("0x") ? (held.find((holding) => holding.token.address === asset.symbol)?.token.symbol ?? "") : asset.symbol;
}

function Chip({ on, label, mark, onPress }: { on: boolean; label: string; mark?: React.ReactNode; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={[styles.chip, { backgroundColor: on ? color.ink : color.raised2 }]}
    >
      {mark}
      <Text style={[TYPE.chipLabel, { color: on ? color.ground : color.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  grow: { flex: 1 },
  scroll: { gap: SPACE.lg, paddingHorizontal: SPACE.inset, paddingTop: SPACE.sm, paddingBottom: SPACE.lg },
  section: { gap: SPACE.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, height: SIZE.chipHeight, borderRadius: SIZE.chipHeight / HALF, paddingHorizontal: SPACE.md },
  switch: { paddingHorizontal: SPACE.inset, paddingBottom: SPACE.sm },
  footer: { gap: SPACE.xs, paddingHorizontal: SPACE.inset, paddingBottom: SPACE.xl },
  columns: { flex: 1, flexDirection: "row", gap: SPACE.lg, paddingHorizontal: SPACE.inset, paddingBottom: SPACE.lg },
  ticketColumn: { width: TICKET_COLUMN, maxWidth: "50%", minWidth: TICKET_MIN },
  solo: { flex: 1, width: "100%", maxWidth: TICKET_COLUMN, alignSelf: "center" },
  pair: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  flip: { width: SIZE.touch, height: SIZE.touch, borderRadius: SIZE.touch / HALF, alignItems: "center", justifyContent: "center" },
  raceColumn: { flex: 1, padding: SPACE.lg, gap: SPACE.md },
  raceScroll: { gap: SPACE.md, paddingBottom: SPACE.lg },
});
