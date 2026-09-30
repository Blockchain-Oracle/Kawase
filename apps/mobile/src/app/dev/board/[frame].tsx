// Internal route: one frame of the direction board (story · home · voice · receive), full screen, with the
// preview params for theme, network and language, so every frame can be shot by link.
import { useLocalSearchParams } from "expo-router";

import { HomeFrame } from "@/board/home-frame";
import { ReceiveFrame } from "@/board/receive-frame";
import { StoryFrame } from "@/board/story-frame";
import { usePreviewParams } from "@/gallery/use-preview-params";
import { useTheme } from "@/theme/theme-provider";

export default function BoardFrameRoute() {
  const { frame, panel } = useLocalSearchParams<{ frame?: string; panel?: string }>();
  const { locale } = usePreviewParams();
  const { network, mode } = useTheme();
  const index = Number(panel) || 0;
  switch (frame) {
    case "home":
      return <HomeFrame locale={locale} network={network} mode={mode} />;
    case "voice":
      return <HomeFrame locale={locale} network={network} mode={mode} voice />;
    case "fan":
      return <HomeFrame locale={locale} network={network} mode={mode} fan />;
    case "receive":
      return <ReceiveFrame locale={locale} network={network} />;
    default:
      return <StoryFrame locale={locale} network={network} index={index} autoAdvance={panel === undefined} />;
  }
}
