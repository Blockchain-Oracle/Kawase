import { useLocalSearchParams } from "expo-router";

import { SendScreen } from "@/screens/send-screen";

const CANONICAL_AMOUNT = /^\d+(\.\d+)?$/;

/** `/send?to=@amina&amount=10&asset=USDC&request=<token>` prefills the flow (from chat, a contact, or a payment link). */
export default function SendRoute() {
  const params = useLocalSearchParams<{ to?: string; amount?: string; asset?: string; request?: string }>();
  const amount = params.amount && CANONICAL_AMOUNT.test(params.amount) ? params.amount : undefined;
  const asset = params.asset === "USDC" || params.asset === "EURC" ? params.asset : undefined;
  return <SendScreen prefill={{ to: params.to?.trim() || undefined, amount, asset, requestToken: params.request?.trim() || undefined }} />;
}
