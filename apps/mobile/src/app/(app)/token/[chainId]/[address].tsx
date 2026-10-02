import { useLocalSearchParams } from "expo-router";

import { TokenScreen } from "@/screens/token-screen";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** `/token/5042/0x…`: any token's page on its own network (from Markets, Home, search, chat, a share link). */
export default function TokenRoute() {
  const params = useLocalSearchParams<{ chainId: string; address: string }>();
  const chainId = Number(params.chainId);
  const address = params.address && ADDRESS.test(params.address) ? params.address : "";
  return <TokenScreen chainId={chainId} address={address} />;
}
