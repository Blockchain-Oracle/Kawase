// The avatar at the top-left of every tab header (surfaces.md "Shell"): profile and settings open from here, now
// that the dock carries Home · Markets · orb · Chat · Activity. Guests see the same avatar; settings say what a
// guest can do there.
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";

import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

const AVATAR = 40;
const HIT_SLOP = 6;

export function HeaderAvatar() {
  const { t } = useT();
  const router = useRouter();
  const { user } = useSession();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("home.dockProfile")} hitSlop={HIT_SLOP} onPress={() => router.navigate("/settings")} className="active:opacity-70">
      <DefaultAvatar seed={user?.id ?? "guest"} size={AVATAR} />
    </Pressable>
  );
}
