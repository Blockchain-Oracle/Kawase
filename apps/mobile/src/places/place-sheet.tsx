// One place (surfaces.md Contacts "My places"): add an exchange deposit address or the person's own wallet on a
// chain, or rename, withdraw to, or forget a saved one. Asks only what cannot be inferred: which exchange or chain
// and the address (paste); the name is optional (Kawase names it "Kraken" or "My wallet on Base").
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ArrowUpFromLine, ClipboardPaste, Trash2 } from "lucide-react-native";
import * as React from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { ExchangeView, PlaceView } from "@kawase/api-client";
import { chainKey, exchangeKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { shortAddress } from "@/send/copy";
import { api } from "@/session/api";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useDestinationName } from "@/withdraw/copy";

const TILE_MARK = 36;
const CHAIN_MARK = 24;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const LABEL_MAX = 40;

type ChainView = { key: string; name: string; chainId: number | null };

type PlaceSheetProps = {
  open: boolean;
  /** A saved place to edit; absent = add a new one. */
  place: PlaceView | undefined;
  exchanges: ExchangeView[];
  chains: ChainView[];
  onClose: () => void;
  onChanged: () => void;
};

export function PlaceSheet({ open, place, exchanges, chains, onClose, onChanged }: PlaceSheetProps) {
  const { t } = useT();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const name = useDestinationName();
  const [kind, setKind] = React.useState<"exchange" | "wallet">("exchange");
  const [exchange, setExchange] = React.useState<string>();
  const [chain, setChain] = React.useState<string>();
  const [address, setAddress] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setKind(place?.kind ?? "exchange");
    setExchange(place?.kind === "exchange" ? (place.brand ?? undefined) : undefined);
    setChain(place?.chain.key);
    setAddress(place?.address ?? "");
    setLabel(place?.label ?? "");
    setConfirmDelete(false);
  }, [open, place]);

  const chosenExchange = exchanges.find((entry) => entry.slug === exchange);
  const chainKeyFor = kind === "exchange" ? chosenExchange?.chain.key : chain;
  const valid = Boolean(place) || (ADDRESS.test(address) && Boolean(chainKeyFor) && (kind === "wallet" || Boolean(chosenExchange)));

  const save = async () => {
    setBusy(true);
    try {
      if (place) await api.places.rename(place.id, label.trim());
      else await api.places.create({ kind, brand: kind === "exchange" ? exchange : null, chain: chainKeyFor!, address, label: label.trim() || null });
      toast(t("places.saved"));
      onChanged();
      onClose();
    } catch {
      toast(t("places.failed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!place) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await api.places.remove(place.id);
      toast(t("places.deleted"));
      onChanged();
      onClose();
    } catch {
      toast(t("places.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={place ? name(place) : t("places.addTitle")}
      subtitle={place ? `${place.chain.name} · ${shortAddress(place.address)}` : t("places.addBody")}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
      className="gap-4"
    >
      {place ? null : (
        <>
          <SegmentedControl
            label={t("places.kind")}
            value={kind}
            onValueChange={(value) => setKind(value as "exchange" | "wallet")}
            options={[
              { value: "exchange", label: t("places.kindExchange") },
              { value: "wallet", label: t("places.kindWallet") },
            ]}
          />
          {kind === "exchange" ? (
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
              {exchanges.map((entry) => {
                const selected = entry.slug === exchange;
                const off = entry.unavailable !== null;
                return (
                  <Pressable
                    key={entry.slug}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: off }}
                    accessibilityLabel={off ? `${entry.name}. ${t("withdraw.mainnetOnly")}` : entry.name}
                    disabled={off}
                    onPress={() => setExchange(entry.slug)}
                    className={cn("w-[23%] items-center gap-1 rounded-2xl border py-2.5", selected ? "border-foreground bg-secondary" : "border-border", off && "opacity-50")}
                  >
                    <Mark entity={exchangeKey(entry.slug)} size={TILE_MARK} />
                    <Text numberOfLines={1} className="text-foreground text-xs font-semibold">
                      {entry.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
              {chains.map((entry) => {
                const selected = entry.key === chain;
                return (
                  <Pressable
                    key={entry.key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setChain(entry.key)}
                    className={cn("flex-row items-center gap-2 rounded-full border px-3 py-2", selected ? "border-foreground bg-secondary" : "border-border")}
                  >
                    {entry.chainId ? <Mark entity={chainKey(entry.chainId)} size={CHAIN_MARK} /> : null}
                    <Text className="text-foreground text-sm font-semibold">{entry.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {kind === "exchange" && chosenExchange ? (
            <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>
              {t("withdraw.exchangeSteps", { exchange: chosenExchange.name, asset: chosenExchange.asset, network: chosenExchange.networkLabel })}
            </Text>
          ) : null}
          <View className="border-border flex-row items-center gap-2 rounded-2xl border ps-4 pe-1.5">
            <TextInput
              accessibilityLabel={t("withdraw.address")}
              value={address}
              onChangeText={(text) => setAddress(text.trim())}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t("withdraw.addressPlaceholder")}
              placeholderTextColor={colors["muted-foreground"]}
              className="min-w-0 flex-1 py-3 font-mono text-sm"
              style={{ color: colors.foreground }}
            />
            <Button variant="secondary" size="sm" accessibilityLabel={t("withdraw.paste")} onPress={() => void Clipboard.getStringAsync().then((text) => setAddress(text.trim()))}>
              <Icon as={ClipboardPaste} className="size-4" />
              <Text>{t("withdraw.paste")}</Text>
            </Button>
          </View>
        </>
      )}
      <View className="gap-1.5">
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("places.name")}</Text>
        <TextInput
          accessibilityLabel={t("places.name")}
          value={label}
          onChangeText={setLabel}
          maxLength={LABEL_MAX}
          placeholder={place ? name({ ...place, label: null }) : t("places.namePlaceholder")}
          placeholderTextColor={colors["muted-foreground"]}
          className="border-border rounded-2xl border px-4 py-3 text-base"
          style={{ color: colors.foreground }}
        />
      </View>
      <Button disabled={!valid || busy} onPress={() => void save()}>
        <Text>{busy ? t("common.loading") : t("places.save")}</Text>
      </Button>
      {place ? (
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant="secondary"
            onPress={() => {
              onClose();
              router.push({ pathname: "/withdraw", params: { place: place.id } });
            }}
          >
            <Icon as={ArrowUpFromLine} className="size-4" />
            <Text>{t("places.withdrawHere")}</Text>
          </Button>
          <Button className="flex-1" variant={confirmDelete ? "destructive" : "secondary"} disabled={busy} onPress={() => void remove()}>
            <Icon as={Trash2} className={cn("size-4", confirmDelete && "text-destructive-foreground")} />
            <Text>{confirmDelete ? t("places.deleteConfirm") : t("places.delete")}</Text>
          </Button>
        </View>
      ) : null}
    </Sheet>
  );
}
