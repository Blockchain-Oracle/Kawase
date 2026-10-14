// The header every tab shares (surfaces.md "Header (every tab)"): avatar (profile and settings) · network pill (the
// one-tap toggle; hold it for both networks and their totals) · inbox bell with its count, or a Sign in pill for a
// guest. Three things at most (Abu's review 10-14: the row was crowded); the language is on the welcome story, in the
// sign-in sheet and in Settings. Home puts these in its collapsing header; Markets and Activity use the row.
import * as React from "react";
import { View } from "react-native";

import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { HeaderAvatar } from "@/components/header-avatar";
import { NetworkPill } from "@/components/network-pill";
import { useT } from "@/i18n";
import { InboxBell } from "@/inbox/inbox-bell";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

/** Avatar, then the network pill. */
export function TabHeaderStart() {
  return (
    <>
      <HeaderAvatar />
      <NetworkPill />
    </>
  );
}

/** The inbox bell, or for a guest the Sign in pill. */
export function TabHeaderEnd() {
  const { t } = useT();
  const { status } = useSession();
  const signIn = useSignIn();
  if (status === "account") return <InboxBell />;
  return (
    <Button size="sm" variant="secondary" onPress={signIn.open}>
      <Text>{t("signIn.title")}</Text>
    </Button>
  );
}

/** The plain row for tabs without a collapsing header. */
export function TabHeader({
  className,
  style,
}: {
  className?: string;
  style?: React.ComponentProps<typeof View>["style"];
}) {
  return (
    <View className={cn("flex-row items-center justify-between gap-3", className)} style={style}>
      <View className="flex-row items-center gap-2">
        <TabHeaderStart />
      </View>
      <TabHeaderEnd />
    </View>
  );
}
