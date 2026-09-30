// Native twin of ui-web's wallet-card-2 (21st.dev beratberkayg/wallet-card-2), same props.
import { Amount } from "@kawase/ui-native/components/amount";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Card } from "@kawase/ui-native/components/ui/card";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import type * as React from "react";
import { View } from "react-native";

type WalletCardAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** "primary" and "secondary" are wide buttons with a label; "icon" is a square icon button. */
  kind: "primary" | "secondary" | "icon";
};

type WalletCardAccount = {
  id: string;
  name: string;
  detail: string;
  amount: string;
  icon: React.ReactNode;
};

type WalletCardProps = {
  label: string;
  amount: string;
  subAmount?: string;
  badge?: React.ReactNode;
  actions: WalletCardAction[];
  accounts?: WalletCardAccount[];
  onAction?: (id: string) => void;
  /** Tighter padding for dense layouts. */
  dense?: boolean;
  className?: string;
};

function WalletCard({
  label,
  amount,
  subAmount,
  badge,
  actions,
  accounts = [],
  onAction,
  dense = false,
  className,
}: WalletCardProps) {
  return (
    <Card className={cn("rounded-xl", dense ? "gap-2.5 p-3" : "gap-4 p-4", className)}>
      <View className={cn("border-border bg-background rounded-lg border", dense ? "gap-2 p-3" : "gap-3 p-4")}>
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-muted-foreground text-sm font-medium">{label}</Text>
          {badge}
        </View>
        <View className="gap-1">
          <Amount className="text-3xl font-semibold tracking-tight">{amount}</Amount>
          {subAmount ? <Amount className="text-muted-foreground text-sm">{subAmount}</Amount> : null}
        </View>
      </View>

      <View className="flex-row gap-2">
        {actions.map((action) =>
          action.kind === "icon" ? (
            <Button
              key={action.id}
              variant="secondary"
              size="icon"
              accessibilityLabel={action.label}
              onPress={() => onAction?.(action.id)}
              className="border-border size-11 rounded-lg border"
            >
              {action.icon}
            </Button>
          ) : (
            <Button
              key={action.id}
              variant={action.kind === "primary" ? "default" : "secondary"}
              onPress={() => onAction?.(action.id)}
              className={cn("h-11 flex-1 rounded-lg", action.kind === "secondary" && "border-border border")}
            >
              {action.icon}
              <Text>{action.label}</Text>
            </Button>
          ),
        )}
      </View>

      {accounts.length > 0 ? (
        <View className="gap-1">
          {accounts.map((account) => (
            <View
              key={account.id}
              className={cn("border-border flex-row items-center gap-3 rounded-lg border", dense ? "px-3 py-2" : "p-3")}
            >
              <View className="bg-muted size-9 items-center justify-center rounded-lg">{account.icon}</View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-medium">
                  {account.name}
                </Text>
                <Text numberOfLines={1} className="text-muted-foreground text-xs">
                  {account.detail}
                </Text>
              </View>
              <Amount className="text-sm">{account.amount}</Amount>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export { WalletCard };
export type { WalletCardAccount, WalletCardAction, WalletCardProps };
