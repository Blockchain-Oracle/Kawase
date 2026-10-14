// Wallet & limits became the weekly budget (D38): its caps, what it covers, pause, the risk dial, practice and
// revoke-all all live on /budget now. Old links (Settings, the safety card, a practice refusal) land there.
import { Redirect } from "expo-router";

export default function LimitsRoute() {
  return <Redirect href="/budget" />;
}
