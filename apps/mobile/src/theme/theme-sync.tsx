// Keeps the theme (light/dark) and the network layer in step with the account's settings and the phone.
import * as React from "react";
import { useColorScheme } from "react-native";

import { useSession } from "@/session/session-provider";
import { useTheme } from "@/theme/theme-provider";

export function ThemeSync() {
  const { user } = useSession();
  const scheme = useColorScheme();
  const { setMode, setNetwork } = useTheme();

  React.useEffect(() => {
    if (!user) return;
    setNetwork(user.activeNetwork);
    // "Match my phone" goes dark only when the phone is dark; anything unknown stays light (Senryo: light-first).
    if (user.theme === "system") setMode(scheme === "dark" ? "dark" : "light");
    else setMode(user.theme);
  }, [user, scheme, setMode, setNetwork]);

  return null;
}
