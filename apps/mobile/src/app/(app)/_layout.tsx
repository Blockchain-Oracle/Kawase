// The signed-in area (guest or account): everything under it needs a session. The tabs with the dock are one
// screen of this stack; wallet setup, sign-in, receive and the inbox push over them without the dock. The
// parenthesised group keeps the URL paths, so "/", "/settings", "/wallet" and "/sign-in" are unchanged.
import { Redirect, Stack } from "expo-router";

import { useSession } from "@/session/session-provider";

export default function AppLayout() {
  const { status } = useSession();
  if (status === "loading") return null;
  if (status === "none") return <Redirect href="/welcome" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
