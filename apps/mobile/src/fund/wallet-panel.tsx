// Add money → From a wallet (A6, web): the browser's own wallets with their real icons; one tap connects, then the
// wallet's USDC on Arc, quick amounts, and one button that asks that wallet to pay the person's Kawase address. Every
// state is drawn: none installed (the Receive code is the way), asking the wallet, switching it to Arc, confirming in
// it, arriving, arrived (sound and haptic), refused or failed (nothing moved, try again).
import * as React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { formatUnits, parseUnits, type Address } from "viem";

import type { NetworkId } from "@kawase/api-client";

import { Button, EmptyState, Skeleton, WaitingText } from "@/components/kit";
import { Check, Icon } from "@/components/kit/icons";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { SheetRow } from "@/components/sheet/SheetRow";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";

import { type AnnouncedWallet, connectWallet, payIn, type PayInStage, useAnnouncedWallets, walletUsdc } from "./browser-wallets";
import { SheetHeaderRow } from "./sheet-parts";

const USDC_DECIMALS = 6;
const PRESETS = ["5", "10", "25"];
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const ICON = SIZE.markToken;
const NONE = 0n;

type State =
  | { kind: "pick" }
  | { kind: "connecting"; wallet: AnnouncedWallet }
  | { kind: "connected"; wallet: AnnouncedWallet; from: Address; balance: bigint | undefined }
  | { kind: "paying"; wallet: AnnouncedWallet; from: Address; amount: bigint; stage: PayInStage }
  | { kind: "arrived"; amount: bigint }
  | { kind: "stopped"; wallet: AnnouncedWallet; from: Address; refused: boolean };

const short = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

function WalletIcon({ wallet }: { wallet: AnnouncedWallet }) {
  return <Image source={{ uri: wallet.icon }} style={{ width: ICON, height: ICON, borderRadius: RADIUS.sm }} accessibilityIgnoresInvertColors />;
}

export function WalletPanel({
  network,
  to,
  back,
  onReceive,
  onArrived,
}: {
  network: NetworkId;
  /** The person's Kawase address on Arc. */
  to: Address;
  back: { label: string; onPress: () => void };
  /** No wallet here: the Receive code works with any wallet app. */
  onReceive: () => void;
  onArrived: () => void;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const wallets = useAnnouncedWallets();
  const [state, setState] = React.useState<State>({ kind: "pick" });
  const [amount, setAmount] = React.useState("10");
  const usd = (base: bigint) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(formatUnits(base, USDC_DECIMALS)));

  const connect = async (wallet: AnnouncedWallet) => {
    fire("tick");
    setState({ kind: "connecting", wallet });
    try {
      const from = await connectWallet(wallet);
      setState({ kind: "connected", wallet, from, balance: undefined });
      const balance = await walletUsdc(network, from).catch(() => undefined);
      setState((current) => (current.kind === "connected" && current.from === from ? { ...current, balance } : current));
    } catch {
      setState({ kind: "pick" });
    }
  };

  const send = async (wallet: AnnouncedWallet, from: Address, value: bigint) => {
    setState({ kind: "paying", wallet, from, amount: value, stage: "switching" });
    const result = await payIn({ wallet, from, to, amount: value, network, onStage: (stage) => setState({ kind: "paying", wallet, from, amount: value, stage }) });
    if (result.status === "arrived") {
      fire("filled", { sound: "received", identity: `pay-in:${result.hash}` });
      setState({ kind: "arrived", amount: value });
      onArrived();
    } else {
      fire("fail");
      setState({ kind: "stopped", wallet, from, refused: result.status === "refused" });
    }
  };

  let body: React.ReactNode;
  if (state.kind === "pick" || state.kind === "connecting") {
    body =
      wallets.length === 0 ? (
        <EmptyState why={t("fund.walletNone")} detail={t("fund.walletNoneBody")} action={{ label: t("fund.receiveTitle"), onPress: onReceive }} size="inline" />
      ) : (
        <>
          {wallets.map((wallet, index) => (
            <SheetRow
              key={wallet.uuid}
              index={index}
              title={wallet.name}
              detail={state.kind === "connecting" && state.wallet.uuid === wallet.uuid ? t("fund.walletConnecting", { wallet: wallet.name }) : undefined}
              leading={<WalletIcon wallet={wallet} />}
              disabled={state.kind === "connecting"}
              onPress={() => void connect(wallet)}
            />
          ))}
        </>
      );
  } else if (state.kind === "connected") {
    const value = parseUnits(amount || "0", USDC_DECIMALS);
    const enough = state.balance === undefined || value <= state.balance;
    body = (
      <>
        <View style={[styles.who, { backgroundColor: color.raised2 }]}>
          <WalletIcon wallet={state.wallet} />
          <View style={styles.grow}>
            <Text style={[TYPE.rowStrong, { color: color.ink }]}>{state.wallet.name}</Text>
            {state.balance === undefined ? (
              <Skeleton width="60%" height={SIZE.skeletonSmall} />
            ) : (
              <Text style={[TYPE.rowDetail, { color: color.text2 }]}>
                {state.balance > NONE ? t("fund.walletHolds", { amount: usd(state.balance) }) : t("fund.walletEmpty")} · {short(state.from)}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.chips}>
          {[...PRESETS, ...(state.balance && state.balance > NONE ? ["all"] : [])].map((preset) => {
            const label = preset === "all" ? t("fund.walletAll") : `$${preset}`;
            const next = preset === "all" ? formatUnits(state.balance!, USDC_DECIMALS) : preset;
            const on = amount === next;
            return (
              <Pressable
                key={preset}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  fire("tick");
                  setAmount(next);
                }}
                style={[styles.chip, { backgroundColor: on ? color.ink : color.raised2 }]}
              >
                <Text style={[TYPE.chipLabel, { color: on ? color.ground : color.ink }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Button label={t("fund.walletSend", { amount: usd(value) })} disabled={value === NONE || !enough} onPress={() => void send(state.wallet, state.from, value)} />
        <Button label={t("fund.walletOther")} variant="ghost" size="sm" onPress={() => setState({ kind: "pick" })} />
      </>
    );
  } else if (state.kind === "paying") {
    const words =
      state.stage === "switching"
        ? t("fund.walletSwitching", { wallet: state.wallet.name })
        : state.stage === "confirm"
          ? t("fund.walletConfirm", { wallet: state.wallet.name })
          : t("fund.walletArriving");
    body = (
      <View style={[styles.who, { backgroundColor: color.raised2 }]}>
        <WalletIcon wallet={state.wallet} />
        <View style={styles.grow}>
          <Text style={[TYPE.rowStrong, { color: color.ink }]}>{`${usd(state.amount)} USDC`}</Text>
          {/* The wallet's own question is the person's wait, not the network's: no timeout until it is on its way. */}
          <WaitingText timeoutMs={state.stage === "arriving" ? undefined : null}>{words}</WaitingText>
        </View>
      </View>
    );
  } else if (state.kind === "arrived") {
    body = (
      <View style={styles.done}>
        <View style={[styles.check, { backgroundColor: color.up }]}>
          <Icon icon={Check} size={SIZE.icon} tint={color.ground} />
        </View>
        <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{t("fund.walletArrived", { amount: usd(state.amount) })}</Text>
      </View>
    );
  } else {
    body = (
      <>
        <Text style={[TYPE.body, { color: color.ink }]}>{state.refused ? t("fund.walletRefused", { wallet: state.wallet.name }) : t("fund.walletFailed")}</Text>
        <Button label={t("fund.walletAgain")} onPress={() => setState({ kind: "connected", wallet: state.wallet, from: state.from, balance: undefined })} />
      </>
    );
  }

  return (
    <>
      <SheetHeaderRow title={t("fund.walletTitle")} back={back} />
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  who: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.md, borderRadius: RADIUS.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  chip: { height: SIZE.chipHeight, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.md, justifyContent: "center" },
  done: { alignItems: "center", gap: SPACE.md, paddingVertical: SPACE.xl },
  check: { width: SIZE.touch, height: SIZE.touch, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
});
