// Where the money goes (money-out.md "From → To"; surfaces.md Withdraw step 2): My places first (saved after a
// withdrawal, a tap on a logo), then an exchange by its logo (the exchange table says which network it takes USDC
// on; exchanges are mainnet only and say so on testnet), the person's own wallet on Arc or another chain, or their
// bank — through an exchange, with the path stated. Asked only what cannot be inferred: the deposit address (paste),
// with that exchange's own steps beside it.
import * as Clipboard from "expo-clipboard";
import { Building2, ClipboardPaste, Landmark, Wallet as WalletIcon, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, TextInput, View } from "react-native";

import type { ExchangeView, NetworkId, PlaceView, WithdrawDestinationView } from "@kawase/api-client";
import { chainKey, exchangeKey, walletKey } from "@kawase/identity";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { shortAddress } from "@/send/copy";
import { useThemeColors } from "@/theme/use-theme-colors";

import { useDestinationName } from "./copy";

const ROW_MARK = 36;
const TILE_MARK = 44;
const CHAIN_MARK = 28;
const ROW_ICON = 36;

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

export function DestinationPicker({ network, value, onChange, places, exchanges, chains, chosen, onForget }: DestinationPickerProps) {
  const { t } = useT();
  const colors = useThemeColors();
  const name = useDestinationName();
  const [mode, setMode] = React.useState<Mode>("list");
  const testnet = network === "testnet";

  if (chosenSomething(value)) {
    const exchange = chosen?.exchange ?? exchanges.find((entry) => entry.slug === value.exchange) ?? null;
    const needsAddress = !value.place;
    const mark = chosen ? brandMark(chosen.kind, chosen.brand, chosen.chain.chainId) : exchange ? exchangeKey(exchange.slug) : "";
    return (
      <View className="bg-card border-border gap-3 rounded-3xl border p-4">
        <View className="flex-row items-center gap-3">
          {mark ? <Mark entity={mark} size={ROW_MARK} /> : null}
          <View className="min-w-0 flex-1">
            <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{chosen ? name(chosen) : (exchange?.name ?? "")}</Text>
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
              {exchange ? t("withdraw.exchangeNetwork", { asset: exchange.asset, network: exchange.networkLabel }) : t("withdraw.onChain", { chain: chosen?.chain.name ?? "" })}
              {chosen?.address && !needsAddress ? ` · ${shortAddress(chosen.address)}` : ""}
            </Text>
          </View>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              setMode("list");
              onChange({});
            }}
          >
            <Text>{t("withdraw.change")}</Text>
          </Button>
        </View>
        {needsAddress ? (
          <View className="gap-2">
            <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>
              {exchange ? t("withdraw.exchangeSteps", { exchange: exchange.name, asset: exchange.asset, network: exchange.networkLabel }) : t("withdraw.walletSteps", { chain: chosen?.chain.name ?? "" })}
            </Text>
            <View className="border-border flex-row items-center gap-2 rounded-2xl border ps-4 pe-1.5">
              <TextInput
                accessibilityLabel={t("withdraw.address")}
                value={value.address ?? chosen?.address ?? ""}
                onChangeText={(text) => onChange({ ...value, address: text.trim() })}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t("withdraw.addressPlaceholder")}
                placeholderTextColor={colors["muted-foreground"]}
                className="min-w-0 flex-1 py-3 font-mono text-sm"
                style={{ color: colors.foreground }}
              />
              <Button
                variant="secondary"
                size="sm"
                accessibilityLabel={t("withdraw.paste")}
                onPress={() => void Clipboard.getStringAsync().then((text) => onChange({ ...value, address: text.trim() }))}
              >
                <Icon as={ClipboardPaste} className="size-4" />
                <Text>{t("withdraw.paste")}</Text>
              </Button>
            </View>
          </View>
        ) : null}
        {value.bank && exchange ? <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("withdraw.bankThen", { exchange: exchange.name })}</Text> : null}
      </View>
    );
  }

  const exchangeGrid = (bank: boolean) => (
    <View className="flex-row flex-wrap gap-2">
      {exchanges.map((exchange) => {
        const off = exchange.unavailable !== null;
        return (
          <Pressable
            key={exchange.slug}
            accessibilityRole="button"
            accessibilityLabel={off ? `${exchange.name}. ${t("withdraw.mainnetOnly")}` : exchange.name}
            accessibilityState={{ disabled: off }}
            disabled={off}
            onPress={() => onChange({ exchange: exchange.slug, bank })}
            className={cn("bg-card border-border active:bg-secondary w-[23%] items-center gap-1.5 rounded-2xl border py-3", off && "opacity-50")}
          >
            <Mark entity={exchangeKey(exchange.slug)} size={TILE_MARK} />
            <Text numberOfLines={1} className="text-foreground text-xs font-semibold">
              {exchange.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (mode === "wallet")
    return (
      <View className="gap-3">
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("withdraw.walletChain")}</Text>
        <View className="flex-row flex-wrap gap-2">
          {chains.map((chain) => (
            <Pressable
              key={chain.key}
              accessibilityRole="button"
              onPress={() => onChange({ chain: chain.key })}
              className="border-border active:bg-secondary flex-row items-center gap-2 rounded-full border px-3 py-2"
            >
              {chain.chainId ? <Mark entity={chainKey(chain.chainId)} size={CHAIN_MARK} /> : null}
              <Text className="text-foreground text-sm font-semibold">{chain.name}</Text>
            </Pressable>
          ))}
        </View>
        <Button variant="ghost" onPress={() => setMode("list")}>
          <Text>{t("common.back")}</Text>
        </Button>
      </View>
    );

  if (mode === "bank")
    return (
      <View className="gap-3">
        <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("withdraw.bankBody")}</Text>
        {exchangeGrid(true)}
        {testnet ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("withdraw.exchangesMainnet")}</Text> : null}
        <Button variant="ghost" onPress={() => setMode("list")}>
          <Text>{t("common.back")}</Text>
        </Button>
      </View>
    );

  const roundIcon = (icon: typeof Building2) => (
    <View className="bg-secondary items-center justify-center rounded-full" style={{ width: ROW_ICON, height: ROW_ICON }}>
      <Icon as={icon} className="size-5" />
    </View>
  );

  return (
    <View className="gap-4">
      {places.length > 0 ? (
        <ListGroup label={t("withdraw.myPlaces")}>
          {places.map((place) => (
            <ListRow
              key={place.id}
              leading={<Mark entity={brandMark(place.kind, place.brand, place.chain.chainId)} size={ROW_MARK} />}
              title={name(place)}
              subtitle={`${place.chain.name} · ${shortAddress(place.address)}`}
              onPress={() => onChange({ place: place.id })}
              trailing={
                <Pressable accessibilityRole="button" accessibilityLabel={t("withdraw.forget", { name: name(place) })} hitSlop={12} onPress={() => onForget(place)}>
                  <Icon as={X} className="text-muted-foreground size-4" />
                </Pressable>
              }
            />
          ))}
        </ListGroup>
      ) : null}
      <View className="gap-2">
        <Text className={cn("text-muted-foreground px-1 text-xs font-semibold uppercase", TEXT_START)}>{t("withdraw.exchanges")}</Text>
        {exchangeGrid(false)}
        {testnet ? <Text className={cn("text-muted-foreground px-1 text-xs", TEXT_START)}>{t("withdraw.exchangesMainnet")}</Text> : null}
      </View>
      <ListGroup>
        <ListRow leading={roundIcon(WalletIcon)} title={t("withdraw.otherWallet")} subtitle={t("withdraw.otherWalletBody")} chevron onPress={() => setMode("wallet")} />
        <ListRow leading={roundIcon(Landmark)} title={t("withdraw.bank")} subtitle={t("withdraw.bankRow")} chevron onPress={() => setMode("bank")} />
      </ListGroup>
    </View>
  );
}
