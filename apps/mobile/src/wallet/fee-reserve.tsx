// The fee reserve (B2-3, plan §A.4 12): Arc's network fees are paid in USDC, so the USDC in the wallet is also how
// many actions it can pay for. The chip says "~N actions left" (from Arc's current gas price, read by the api), turns
// to a warning when it runs low, and its tap explains that a USDC or EURC send is carried by Kawase's relayer when the
// wallet can't pay — there is no "out of gas" dead end. "Send max" keeps the reserve.
import { Fuel } from "lucide-react-native";
import * as React from "react";
import { Pressable } from "react-native";
import { toast } from "sonner-native";

import type { FeeReserveView } from "@kawase/api-client";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export function useFeeReserve(): FeeReserveView | undefined {
  const { status, user } = useSession();
  const network = user?.activeNetwork;
  const [reserve, setReserve] = React.useState<FeeReserveView>();
  React.useEffect(() => {
    if (status !== "account") {
      setReserve(undefined);
      return;
    }
    let live = true;
    void api.fees
      .reserve()
      .then((result) => {
        if (live) setReserve(result.reserve);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [status, network]);
  return reserve;
}

export function FeeReserveChip({ reserve, className }: { reserve: FeeReserveView | undefined; className?: string }) {
  const { t } = useT();
  if (!reserve?.hasWallet) return null;
  const label = reserve.actionsLeft > 0 ? t("fees.actionsLeft", { n: String(reserve.actionsLeft) }) : t("fees.noneLeft");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => toast(label, { description: t("fees.explain") })}
      className={cn("flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1", reserve.low ? "bg-destructive/10" : "bg-muted", className)}
    >
      <Icon as={Fuel} className={cn("size-3.5", reserve.low ? "text-destructive" : "text-muted-foreground")} />
      <Text className={cn("text-xs font-semibold", reserve.low ? "text-destructive" : "text-muted-foreground")}>{label}</Text>
    </Pressable>
  );
}
