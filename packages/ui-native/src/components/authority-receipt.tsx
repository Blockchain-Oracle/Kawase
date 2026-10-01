// The authority receipt (S10, journey 4/12): what the agent can do with this person's money, what it can never
// do, and the worst case, in plain words — decoded by the caller from the signed caveats, never from a draft.
// Shown at completion, in Wallet & limits, and for automation grants. A receipt with terms the app cannot read
// shows the warning instead of reassurance.
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { Check, ShieldAlert, ShieldCheck, X } from "lucide-react-native";
import { View } from "react-native";

type AuthorityReceiptProps = {
  /** "Kawase can", "Kawase can never", "Worst case" — the three section names. */
  labels: { can: string; never: string; worst: string };
  can: readonly string[];
  never: readonly string[];
  worst: string;
  /** The eyebrow: network and validity ("Arc Testnet · until 30 Dec"). */
  meta?: string;
  /** Set when the grant has terms the app does not understand; replaces the reassurance. */
  warning?: string;
  className?: string;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className={cn("text-muted-foreground text-xs font-semibold uppercase", TEXT_START)}>{title}</Text>
      {children}
    </View>
  );
}

function Line({ icon, tone, children }: { icon: typeof Check; tone: "success" | "muted"; children: string }) {
  return (
    <View className="flex-row items-start gap-2.5">
      <Icon as={icon} className={cn("mt-0.5 size-4", tone === "success" ? "text-success" : "text-muted-foreground")} />
      <Text className={cn("text-foreground flex-1 text-base leading-6", TEXT_START)}>{children}</Text>
    </View>
  );
}

function AuthorityReceipt({ labels, can, never, worst, meta, warning, className }: AuthorityReceiptProps) {
  return (
    <View className={cn("bg-card border-border gap-5 rounded-3xl border p-5", className)}>
      {meta ? <StateLabel className="text-muted-foreground text-start">{meta}</StateLabel> : null}
      {warning ? (
        <View className="flex-row items-start gap-2.5">
          <Icon as={ShieldAlert} className="text-destructive mt-0.5 size-5" />
          <Text className={cn("text-destructive flex-1 text-base leading-6", TEXT_START)}>{warning}</Text>
        </View>
      ) : null}
      <Section title={labels.can}>
        {can.map((line) => (
          <Line key={line} icon={Check} tone="success">
            {line}
          </Line>
        ))}
      </Section>
      <Section title={labels.never}>
        {never.map((line) => (
          <Line key={line} icon={X} tone="muted">
            {line}
          </Line>
        ))}
      </Section>
      <View className="bg-muted flex-row items-start gap-2.5 rounded-2xl px-4 py-3">
        <Icon as={ShieldCheck} className="text-foreground mt-0.5 size-5" />
        <View className="flex-1 gap-0.5">
          <Text className={cn("text-muted-foreground text-xs font-semibold uppercase", TEXT_START)}>{labels.worst}</Text>
          <Text className={cn("text-foreground text-sm leading-5", TEXT_START)}>{worst}</Text>
        </View>
      </View>
    </View>
  );
}

export { AuthorityReceipt };
export type { AuthorityReceiptProps };
