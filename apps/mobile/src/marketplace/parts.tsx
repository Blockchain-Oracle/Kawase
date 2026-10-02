// Pieces shared by the Agent wallet page and the marketplace chat cards: a seller's real mark, a purchase row, a move
// row, the top-up presets and a selectable chip. Prices keep their sub-cent digits; times are in the person's locale.
import { ArrowDownLeft, ArrowUpRight, Layers } from "lucide-react-native";
import { Pressable, View } from "react-native";

import type { AgentWalletMove, PurchaseView } from "@kawase/api-client";
import { providerKey } from "@kawase/identity";
import { Amount } from "@kawase/ui-native/components/amount";
import { ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";

import { usePrice } from "./use-agent-wallet";

const MARK_SIZE = 36;
const ICON_DISC = 36;

/** "BlockRun" → provider:blockrun, "AIsa API" → provider:aisa, "Kawase Demo Seller" → provider:kawase. */
export const sellerEntity = (name: string) => providerKey((name.split(/\s+/)[0] ?? name).toLowerCase().replace(/[^a-z0-9]/g, ""));

export function SellerMark({ name, size = MARK_SIZE }: { name: string; size?: number }) {
  return <Mark entity={sellerEntity(name)} size={size} />;
}

export function useWhen() {
  const { locale } = useLocale();
  return (iso: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function Chip({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className={cn("rounded-full border px-3.5 py-2", selected ? "bg-primary border-primary" : "bg-card border-border active:bg-muted")}
    >
      <Text className={cn("text-sm font-semibold", selected ? "text-primary-foreground" : "text-foreground")}>{label}</Text>
    </Pressable>
  );
}

export function PurchaseRow({ purchase, onPress }: { purchase: PurchaseView; onPress?: () => void }) {
  const { t } = useT();
  const price = usePrice();
  const when = useWhen();
  const settled = purchase.status === "paid" || purchase.status === "failed_after_payment";
  return (
    <ListRow
      leading={<SellerMark name={purchase.provider} />}
      title={purchase.description ?? purchase.provider}
      subtitle={`${purchase.provider} · ${when(purchase.createdAt)}${purchase.status === "paid" ? "" : ` · ${t(`agentWallet.status.${purchase.status}`)}`}`}
      trailing={<Amount className={cn("text-sm font-semibold", settled ? "text-foreground" : "text-muted-foreground")}>{`−${price(purchase.amount)}`}</Amount>}
      {...(onPress ? { onPress } : {})}
    />
  );
}

export function MoveRow({ move }: { move: AgentWalletMove }) {
  const { t } = useT();
  const price = usePrice();
  const when = useWhen();
  const icon = move.kind === "top_up" ? ArrowDownLeft : move.kind === "return" ? ArrowUpRight : Layers;
  const title = { top_up: t("agentWallet.moveTopUp"), return: t("agentWallet.moveReturn"), deposit: t("agentWallet.moveDeposit"), refill: t("agentWallet.moveRefill") }[move.kind];
  const state = move.status === "confirmed" ? "" : ` · ${move.status === "pending" ? t("agentWallet.pending") : t("agentWallet.failedRow")}`;
  return (
    <ListRow
      leading={
        <View className="bg-muted items-center justify-center rounded-full" style={{ width: ICON_DISC, height: ICON_DISC }}>
          <Icon as={icon} className="text-muted-foreground size-4" />
        </View>
      }
      title={title}
      subtitle={`${when(move.createdAt)}${state}`}
      trailing={
        <Amount className={cn("text-sm font-semibold", move.kind === "top_up" ? "text-success" : "text-foreground")}>
          {`${move.kind === "top_up" ? "+" : move.kind === "return" ? "−" : ""}${price(move.amount)}`}
        </Amount>
      }
    />
  );
}

/** The top-up presets as chips; the chosen one is highlighted. */
export function TopUpPresets({ presets, value, onChange, disabled }: { presets: string[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const price = usePrice();
  return (
    <View className="flex-row flex-wrap gap-2">
      {presets.map((preset) => (
        <Chip key={preset} label={price(preset)} selected={preset === value} onPress={() => onChange(preset)} {...(disabled !== undefined ? { disabled } : {})} />
      ))}
    </View>
  );
}
