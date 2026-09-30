// Source: 21st.dev beratberkayg/wallet-card-2. Reskinned for Kawase: same structure (total balance block,
// action row with two wide buttons and icon buttons, account rows), but all content comes from props and
// every colour resolves to a token. The published source had malformed JSX and fixed pink/purple gradients.
import * as React from "react";
import { Eye, RefreshCw } from "lucide-react";

import { Button } from "@kawase/ui-web/components/ui/button";
import { Card } from "@kawase/ui-web/components/ui/card";
import { cn } from "@kawase/ui-web/lib/utils";

export interface WalletCardAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** "primary" and "secondary" are wide buttons with a label; "icon" is a square icon button. */
  kind: "primary" | "secondary" | "icon";
}

export interface WalletCardAccount {
  id: string;
  name: string;
  detail: string;
  amount: string;
  icon: React.ReactNode;
}

export interface WalletCardProps {
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
}

export function WalletCard({ label, amount, subAmount, badge, actions, accounts = [], onAction, dense = false, className }: WalletCardProps) {
  return (
    <Card className={cn("rounded-xl border bg-card text-card-foreground shadow-none", dense ? "gap-2.5 p-3" : "gap-4 p-4", className)}>
      <div className={cn("rounded-lg border border-border bg-background", dense ? "space-y-2 p-3" : "space-y-3 p-4")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium">{label}</span>
            <Eye className="size-4" aria-hidden />
          </div>
          <div className="flex items-center gap-2">
            {badge}
            <RefreshCw className="size-4 text-muted-foreground" aria-hidden />
          </div>
        </div>
        <div className="space-y-1">
          {/* The figures read left-to-right, but the line sits on the side where reading starts. */}
          <div className="font-mono text-3xl font-semibold tabular-nums tracking-tight"><bdi dir="ltr">{amount}</bdi></div>
          {subAmount ? <div className="font-mono text-sm tabular-nums text-muted-foreground"><bdi dir="ltr">{subAmount}</bdi></div> : null}
        </div>
      </div>

      <div className="flex gap-2">
        {actions.map((action) =>
          action.kind === "icon" ? (
            <Button key={action.id} variant="secondary" size="icon" aria-label={action.label} onClick={() => onAction?.(action.id)} className="size-11 rounded-lg border border-border">
              {action.icon}
            </Button>
          ) : (
            <Button
              key={action.id}
              variant={action.kind === "primary" ? "default" : "secondary"}
              onClick={() => onAction?.(action.id)}
              className={cn("h-11 flex-1 gap-2 rounded-lg", action.kind === "secondary" && "border border-border")}
            >
              {action.icon}
              {action.label}
            </Button>
          ),
        )}
      </div>

      {accounts.length > 0 ? (
        <div className="space-y-1">
          {accounts.map((account) => (
            <div key={account.id} className={cn("flex items-center gap-3 rounded-lg border border-border transition-colors hover:bg-muted/60", dense ? "px-3 py-2" : "p-3")}>
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">{account.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{account.name}</div>
                <div className="truncate text-xs text-muted-foreground">{account.detail}</div>
              </div>
              <div dir="ltr" className="font-mono text-sm tabular-nums">{account.amount}</div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export default WalletCard;
