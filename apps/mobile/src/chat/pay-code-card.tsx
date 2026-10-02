// Everyday-money cards in chat (A5-2). pay_from_code when the code cannot be paid here: the reason and its fix
// (switch network), the same card and words as the scanner (T3: one blocker wording in UI and chat); a payable code
// becomes the send card instead. split_bill: the split's progress card, or what it needs first.
import { useRouter } from "expo-router";

import type { PayCodeView, SplitView } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { PayCodeProblem } from "@/scan/scanner";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { SplitCard } from "@/split/split-card";

import { AgentCard } from "./card";

export function PayCodeCard({ view }: { view: PayCodeView }) {
  return view.status === "unsupported" ? <PayCodeProblem view={view} /> : null;
}

type SplitBillOutput = { status: "created"; split: SplitView } | { status: "needs_sign_in" | "needs_wallet" } | { status: "invalid"; problem: string };

export function SplitBillCard({ output }: { output: SplitBillOutput }) {
  const { t } = useT();
  const router = useRouter();
  const signIn = useSignIn();
  if (output.status === "created") return <SplitCard initial={output.split} />;
  return (
    <AgentCard eyebrow={t("split.eyebrow")}>
      <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>
        {output.status === "needs_sign_in" ? t("request.signInBody") : output.status === "needs_wallet" ? t("receive.setUpFirstBody") : t("split.invalid")}
      </Text>
      {output.status === "invalid" ? (
        <Button variant="secondary" onPress={() => router.push("/split")}>
          <Text>{t("split.openForm")}</Text>
        </Button>
      ) : (
        <Button onPress={() => (output.status === "needs_sign_in" ? signIn.open() : router.push("/wallet"))}>
          <Text>{output.status === "needs_sign_in" ? t("signIn.title") : t("wallet.setUp")}</Text>
        </Button>
      )}
    </AgentCard>
  );
}
