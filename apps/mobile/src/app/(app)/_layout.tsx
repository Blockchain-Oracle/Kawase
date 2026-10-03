// The signed-in area (guest or account): everything under it needs a session. The tabs with the dock are one
// screen of this stack; wallet setup, sign-in, receive and the inbox push over them without the dock. The
// parenthesised group keeps the URL paths, so "/", "/settings", "/wallet" and "/sign-in" are unchanged.
// A saved session that cannot be read yet (offline on the very first open after an update, before any account
// was cached) shows a calm "can't reach Kawase" page with Retry, never a blank screen and never a new guest.
// The overlay state (voice, fan) is this area's, so the desktop sidebar can open the voice overlay from any page. On
// a desktop window (Stage 13) the sidebar stays beside every page, the overlays sit over the whole window, and a
// pushed page is a centred column (two columns wide for the token page).
import { Redirect, Stack, useGlobalSearchParams, usePathname } from "expo-router";

import { rememberDeepLink } from "@/onboarding/continuation";
import { CloudOff } from "lucide-react-native";
import type * as React from "react";
import { View } from "react-native";

import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useWide, WideFrameContext, WIDE_COLUMN_PX, WIDE_PAGE_PX } from "@kawase/ui-native/lib/wide";

import { UpdateRequiredScreen, useUpdateRequired } from "@/account/update-gate";
import { DesktopSidebar } from "@/dock/desktop-sidebar";
import { useT } from "@/i18n";
import { OverlayHost } from "@/overlay/overlay-host";
import { OverlayProvider, useOverlay } from "@/overlay/overlay-provider";
import { SafetyStripFrame } from "@/safety/safety-strip";
import { useSession } from "@/session/session-provider";

const ICON = 40;

/** Pages that lay out in two columns on a desktop window (the token page: chart and stats beside the ticket). */
const WIDE_PAGES = new Set(["token/[chainId]/[address]"]);

export default function AppLayout() {
  const { t } = useT();
  const wide = useWide();
  const { status, connection, retry } = useSession();
  const updateRequired = useUpdateRequired();
  if (updateRequired) return <UpdateRequiredScreen />;
  if (status === "loading" && connection !== "online") {
    return (
      <View className="bg-background flex-1">
        <EmptyState
          art={<Icon as={CloudOff} className="text-muted-foreground" size={ICON} />}
          title={
            connection === "storage-unavailable"
              ? t("errors.storageUnavailable")
              : connection === "offline"
                ? t("errors.offline")
                : t("errors.serverTrouble")
          }
          action={
            <Button onPress={() => void retry()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          }
        />
      </View>
    );
  }
  if (status === "loading") return null;
  if (status === "none") return <SignedOutRedirect />;
  // Paused or practising: one strip above every screen says so (cards/automate-safety.md).
  return (
    <OverlayProvider>
      <SafetyStripFrame>
        <DesktopFrame>
          <Stack
            screenOptions={({ route }) => ({
              headerShown: false,
              ...(wide && route.name !== "(tabs)"
                ? { contentStyle: { width: "100%", alignSelf: "center", maxWidth: WIDE_PAGES.has(route.name) ? WIDE_PAGE_PX : WIDE_COLUMN_PX } }
                : {}),
            })}
          />
        </DesktopFrame>
      </SafetyStripFrame>
    </OverlayProvider>
  );
}

/**
 * The sidebar beside the pages and the overlays above both, on a desktop window; elsewhere only the pages (the tabs
 * draw the dock and host the overlays). The pages keep their place in the tree either way, so a window crossing the
 * breakpoint keeps its navigation.
 */
function DesktopFrame({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const wide = useWide();
  const overlay = useOverlay();
  const { user } = useSession();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  return (
    <View className="bg-background flex-1">
      <View className="flex-1 flex-row" aria-hidden={wide && overlay.current !== null}>
        {wide ? <DesktopSidebar /> : null}
        <View className="flex-1">
          {/* One testnet strip across the content area for every page, pushed pages included (theirs step aside). */}
          {wide && testnet ? <TestnetStrip label={t("network.testnetStrip")} /> : null}
          <WideFrameContext.Provider value={wide}>{children}</WideFrameContext.Provider>
        </View>
      </View>
      {wide ? <OverlayHost /> : null}
    </View>
  );
}

/** No session at all: the story first, and where the link was going is kept for after it (A5-2, R12). */
function SignedOutRedirect() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  // Query parameters only (route segments like `[id]` are already in the path).
  const segments = new Set(pathname.split("/").map((part) => decodeURIComponent(part)));
  const query = Object.entries(params)
    .filter(([, value]) => typeof value === "string" && !segments.has(value))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
    .join("&");
  rememberDeepLink(query ? `${pathname}?${query}` : pathname);
  return <Redirect href="/welcome" />;
}
