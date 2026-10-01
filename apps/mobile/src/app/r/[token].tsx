import { useLocalSearchParams } from "expo-router";

import { PayRequestScreen } from "@/screens/pay-request-screen";

/** A payment request link (`/r/<token>`, `kawase://r/<token>`): open to anyone, with or without an account. */
export default function PayRequestRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <PayRequestScreen token={token ?? ""} />;
}
