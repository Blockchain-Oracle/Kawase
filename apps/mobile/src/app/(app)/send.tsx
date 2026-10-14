import { useLocalSearchParams } from "expo-router";

import { SendScreen } from "@/screens/send-screen";
import { WidePage } from "@/trade/page-frame";

const CANONICAL_AMOUNT = /^\d+(\.\d+)?$/;

/** `/send?to=@amina&amount=10&asset=USDC|0x…&request=<token>` prefills the flow (chat, a contact, a token page, a payment link). */
export default function SendRoute() {
  const params = useLocalSearchParams<{ to?: string; amount?: string; asset?: string; request?: string; memo?: string; memoId?: string }>();
  const amount = params.amount && CANONICAL_AMOUNT.test(params.amount) ? params.amount : undefined;
  const asset = params.asset === "USDC" || params.asset === "EURC" || (params.asset && /^0x[0-9a-fA-F]{40}$/.test(params.asset)) ? params.asset : undefined;
  const memo = params.memo && /^[\x20-\x7E]{1,64}$/.test(params.memo) ? params.memo : undefined;
  const memoId = params.memoId && /^0x[0-9a-fA-F]{64}$/.test(params.memoId) ? params.memoId : undefined;
  return (
    <>
      <WidePage />
      <SendScreen prefill={{ to: params.to?.trim() || undefined, amount, asset, requestToken: params.request?.trim() || undefined, memo, memoId }} />
    </>
  );
}
