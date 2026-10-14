// Where the money goes (money-out.md "From → To"; surfaces.md Withdraw step 2), on the Senryo kit: My places first
// (saved after a withdrawal, a tap on a logo), then an exchange by its real logo in a tile grid (the exchange table says
// which network it takes USDC on; exchanges are mainnet only and say so on testnet), the person's own wallet on Arc or
// another chain, or their bank through an exchange, with the path stated. Asked only what cannot be inferred: the
// deposit address (paste), with that exchange's own steps beside it.
import * as Clipboard from "expo-clipboard";
import { ClipboardPaste, Landmark, Wallet as WalletIcon, X } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { ExchangeView, NetworkId, PlaceView, WithdrawDestinationView } from "@kawase/api-client";
import { chainKey, exchangeKey, walletKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";

import { Button, DISABLED_OPACITY, Icon, ListRow, Panel, RADIUS, SectionLabel, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { shortAddress } from "@/send/copy";

import { useDestinationName } from "./copy";

const ROW_MARK = 36;
const TILE_MARK = 40;
const CHAIN_MARK = 24;
const TILE_W = "23%";

export type DestinationInput = { place?: string | undefined; exchange?: string | undefined; chain?: string | undefined; address?: string | undefined; bank?: boolean | undefined };
type ChainView = { key: string; name: string; chainId: number | null };
type Mode = "list" | "wallet" | "bank";

type DestinationPickerProps = {
  network: NetworkId;
  value: DestinationInput;
  onChange: (next: DestinationInput) => void;
  places: PlaceView[];
  exchanges: ExchangeView[];
  chains: ChainView[];
  /** The plan's view of the chosen destination (names, the exchange's network). */
  chosen: WithdrawDestinationView | null | undefined;
  onForget: (place: PlaceView) => void;
};

const chosenSomething = (value: DestinationInput) => Boolean(value.place || value.exchange || value.chain);

function brandMark(kind: "exchange" | "wallet", brand: string | null, chainId: number | null) {
  if (kind === "exchange" && brand) return exchangeKey(brand);
  if (brand) return walletKey(brand);
  return chainId ? chainKey(chainId) : "";
}

/** No browser focus box: the field's plate carries focus. */
const WEB_FIELD = { outlineStyle: "none" } as unknown as object;

export function DestinationPicker({ network, value, onChange, places, exchanges, chains, chosen, onForget }: DestinationPickerProps) {
  const { t } = useT();
  const { color } = useTheme();
  const name = useDestinationName();
  const [mode, setMode] = React.useState<Mode>("list");
  const testnet = network === "testnet";

  if (chosenSomething(value)) {
    const exchange = chosen?.exchange ?? exchanges.find((entry) => entry.slug === value.exchange) ?? null;
    const needsAddress = !value.place;
    const mark = chosen ? brandMark(chosen.kind, chosen.brand, chosen.chain.chainId) : exchange ? exchangeKey(exchange.slug) : "";
    return (
      <Panel style={styles.panel}>
        <View style={styles.line}>
          {mark ? <Mark entity={mark} size={ROW_MARK} /> : null}
          <View style={styles.grow}>
            <Text style={[TYPE.rowStrong, { color: color.ink }]}>{chosen ? name(chosen) : (exchange?.name ?? "")}</Text>
            <Text style={[TYPE.rowDetail, { color: color.text3 }]}>
              {exchange ? t("withdraw.exchangeNetwork", { asset: exchange.asset, network: exchange.networkLabel }) : t("withdraw.onChain", { chain: chosen?.chain.name ?? "" })}
              {chosen?.address && !needsAddress ? ` · ${shortAddress(chosen.address)}` : ""}
            </Text>
          </View>
          <Button
            label={t("withdraw.change")}
            variant="secondary"
            size="sm"
            block={false}
            onPress={() => {
              setMode("list");
              onChange({});
            }}
          />
        </View>
        {needsAddress ? (
          <View style={styles.group}>
            <Text style={[TYPE.rowDetail, { color: color.text2 }]}>
              {exchange ? t("withdraw.exchangeSteps", { exchange: exchange.name, asset: exchange.asset, network: exchange.networkLabel }) : t("withdraw.walletSteps", { chain: chosen?.chain.name ?? "" })}
            </Text>
            <View style={[styles.address, { backgroundColor: color.input }]}>
              <TextInput
                accessibilityLabel={t("withdraw.address")}
                value={value.address ?? chosen?.address ?? ""}
                onChangeText={(text) => onChange({ ...value, address: text.trim() })}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t("withdraw.addressPlaceholder")}
                placeholderTextColor={color.text3}
                style={[TYPE.rowAmount, styles.grow, styles.input, { color: color.ink }, Platform.OS === "web" ? WEB_FIELD : null]}
              />
              <Button
                label={t("withdraw.paste")}
                variant="ghost"
                size="sm"
                block={false}
                leading={<Icon icon={ClipboardPaste} size={SIZE.iconSm} />}
                onPress={() => void Clipboard.getStringAsync().then((text) => onChange({ ...value, address: text.trim() }))}
              />
            </View>
          </View>
        ) : null}
        {value.bank && exchange ? <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("withdraw.bankThen", { exchange: exchange.name })}</Text> : null}
      </Panel>
    );
  }

  const exchangeGrid = (bank: boolean) => (
    <View style={styles.grid}>
      {exchanges.map((exchange) => {
        const off = exchange.unavailable !== null;
        return (
          <Pressable
            key={exchange.slug}
            accessibilityRole="button"
            accessibilityLabel={off ? `${exchange.name}. ${t("withdraw.mainnetOnly")}` : exchange.name}
            accessibilityState={{ disabled: off }}
            disabled={off}
            onPress={() => {
              fire("tick");
              onChange({ exchange: exchange.slug, bank });
            }}
            style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? color.rowPressed : color.card, opacity: off ? DISABLED_OPACITY : 1 }]}
          >
            <Mark entity={exchangeKey(exchange.slug)} size={TILE_MARK} />
            <Text numberOfLines={1} style={[TYPE.meta, { color: color.ink }]}>
              {exchange.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (mode === "wallet")
    return (
      <View style={styles.group}>
        <SectionLabel>{t("withdraw.walletChain")}</SectionLabel>
        <View style={styles.chains}>
          {chains.map((chain) => (
            <Pressable
              key={chain.key}
              accessibilityRole="button"
              onPress={() => {
                fire("tick");
                onChange({ chain: chain.key });
              }}
              style={({ pressed }) => [styles.chain, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
            >
              {chain.chainId ? <Mark entity={chainKey(chain.chainId)} size={CHAIN_MARK} /> : null}
              <Text style={[TYPE.chipLabel, { color: color.ink }]}>{chain.name}</Text>
            </Pressable>
          ))}
        </View>
        <Button label={t("common.back")} variant="ghost" onPress={() => setMode("list")} />
      </View>
    );

  if (mode === "bank")
    return (
      <View style={styles.group}>
        <Text style={[TYPE.body, { color: color.text2 }]}>{t("withdraw.bankBody")}</Text>
        {exchangeGrid(true)}
        {testnet ? <Text style={[TYPE.caption, { color: color.text3 }]}>{t("withdraw.exchangesMainnet")}</Text> : null}
        <Button label={t("common.back")} variant="ghost" onPress={() => setMode("list")} />
      </View>
    );

  const roundIcon = (icon: typeof WalletIcon) => (
    <View style={[styles.round, { backgroundColor: color.raised2 }]}>
      <Icon icon={icon} size={SIZE.icon} />
    </View>
  );

  return (
    <View style={styles.stack}>
      {places.length > 0 ? (
        <View style={styles.group}>
          <SectionLabel>{t("withdraw.myPlaces")}</SectionLabel>
          <Panel>
            {places.map((place) => (
              <ListRow
                key={place.id}
                leading={<Mark entity={brandMark(place.kind, place.brand, place.chain.chainId)} size={ROW_MARK} />}
                title={name(place)}
                detail={`${place.chain.name} · ${shortAddress(place.address)}`}
                onPress={() => onChange({ place: place.id })}
                trailing={
                  <Pressable accessibilityRole="button" accessibilityLabel={t("withdraw.forget", { name: name(place) })} hitSlop={SPACE.md} onPress={() => onForget(place)}>
                    <Icon icon={X} size={SIZE.iconSm} tint={color.text3} />
                  </Pressable>
                }
              />
            ))}
          </Panel>
        </View>
      ) : null}
      <View style={styles.group}>
        <SectionLabel>{t("withdraw.exchanges")}</SectionLabel>
        {exchangeGrid(false)}
        {testnet ? <Text style={[TYPE.caption, { color: color.text3 }]}>{t("withdraw.exchangesMainnet")}</Text> : null}
      </View>
      <Panel>
        <ListRow leading={roundIcon(WalletIcon)} title={t("withdraw.otherWallet")} detail={t("withdraw.otherWalletBody")} onPress={() => setMode("wallet")} />
        <ListRow leading={roundIcon(Landmark)} title={t("withdraw.bank")} detail={t("withdraw.bankRow")} onPress={() => setMode("bank")} />
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.lg },
  group: { gap: SPACE.sm },
  panel: { gap: SPACE.md, padding: SPACE.lg },
  line: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1, minWidth: 0 },
  address: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, borderRadius: RADIUS.md, paddingStart: SPACE.lg, minHeight: SIZE.inputHeight },
  input: { paddingVertical: SPACE.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  tile: { width: TILE_W, alignItems: "center", gap: SPACE.xs, borderRadius: RADIUS.md, paddingVertical: SPACE.md },
  chains: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  chain: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  round: { width: ROW_MARK, height: ROW_MARK, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
});
