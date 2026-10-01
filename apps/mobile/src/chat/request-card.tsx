// The request card (C3 in chat): what `create_payment_request` made, as the compact share card — amount and asset
// mark, the note the payer will see, the link with Copy and Share — and its live status, which turns to "Paid" on
// its own when the money arrives. A conversation reopened later shows what really happened to the request.
import { useRouter } from "expo-router";

import type { PaymentRequest } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { RequestShareCard } from "@/request/request-share-card";
import { usePaymentRequest } from "@/request/use-payment-request";
import { shortAddress } from "@/send/copy";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";

import { AgentCard } from "./card";

type RequestOutput = { request: PaymentRequest } | { status: "needs_sign_in" | "needs_wallet" };

/** A guest or someone without a wallet cannot be paid into; the card says what to do instead. */
function RequestNeeds({ status }: { status: "needs_sign_in" | "needs_wallet" }) {
  const { t } = useT();
  const router = useRouter();
  const signIn = useSignIn();
  const guest = status === "needs_sign_in";
  return (
    <AgentCard eyebrow={t("request.title")}>
      <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{guest ? t("request.signInTitle") : t("policy.WALLET_NOT_READY")}</Text>
      <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("request.signInBody")}</Text>
      <Button onPress={() => (guest ? signIn.open() : router.push("/wallet"))}>
        <Text>{guest ? t("policy.fixSignIn") : t("policy.fixSetUp")}</Text>
      </Button>
    </AgentCard>
  );
}

export function RequestCard({ output }: { output: RequestOutput }) {
  if (!("request" in output)) return <RequestNeeds status={output.status} />;
  return <RequestShown output={output} />;
}

function RequestShown({ output }: { output: { request: PaymentRequest } }) {
  const { t } = useT();
  const { user } = useSession();
  const { wallet } = useWalletStatus();
  const { request } = usePaymentRequest(output.request);
  const shown = request ?? output.request;
  const networkName = shown.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const requester = user?.handle ? `@${user.handle}` : wallet?.address ? shortAddress(wallet.address) : "";
  return (
    <AgentCard eyebrow={`${t("request.title")} · ${shown.network === "mainnet" ? t("network.realMoney") : networkName}`}>
      <RequestShareCard request={shown} requester={requester} compact />
    </AgentCard>
  );
}
