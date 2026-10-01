// The header's bell with the number of unread inbox items (a small badge; "9+" past nine). The count is said in the
// button's label, so it is never only a colour.
import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { View } from "react-native";

import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";

import { useInbox } from "./use-inbox";

const MAX_SHOWN = 9;
const BADGE = 18;

export function InboxBell() {
  const { t } = useT();
  const router = useRouter();
  const { unread } = useInbox();
  return (
    <View>
      <Button
        variant="secondary"
        size="icon"
        accessibilityLabel={unread > 0 ? t("inbox.bellUnread", { count: String(unread) }) : t("home.inbox")}
        className="size-11"
        onPress={() => router.push("/inbox")}
      >
        <Icon as={Bell} className="size-5" />
      </Button>
      {unread > 0 ? (
        <View
          pointerEvents="none"
          className="bg-primary absolute -end-0.5 -top-0.5 items-center justify-center rounded-full px-1"
          style={{ minWidth: BADGE, height: BADGE }}
        >
          <Text className="text-primary-foreground text-[10px] font-bold">{unread > MAX_SHOWN ? `${MAX_SHOWN}+` : unread}</Text>
        </View>
      ) : null}
    </View>
  );
}
