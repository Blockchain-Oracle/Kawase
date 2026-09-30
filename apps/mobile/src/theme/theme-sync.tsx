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
    if (user.theme === "system") setMode(scheme === "light" ? "light" : "dark");
    else setMode(user.theme);
  }, [user, scheme, setMode, setNetwork]);

  return null;
}
