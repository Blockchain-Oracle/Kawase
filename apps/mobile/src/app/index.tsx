import { Redirect } from "expo-router";

import { HomeScreen } from "@/screens/home-screen";
import { useSession } from "@/session/session-provider";

export default function HomeRoute() {
  const { status } = useSession();
  if (status === "loading") return null;
  if (status === "none") return <Redirect href="/welcome" />;
  return <HomeScreen />;
}
