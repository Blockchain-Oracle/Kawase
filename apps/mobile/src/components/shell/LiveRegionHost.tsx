// The web's one polite live region (Mitoshi's LiveRegion): `announce()` from the kit speaks through it on the web, where
// there is no platform announcer. Mounted once by the signed-in area; renders nothing visible and nothing at all on the
// phone, where VoiceOver and TalkBack speak announcements themselves. The same words appear on the surface, so a sighted
// person sees the change this one tells a screen reader about.
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { registerWebAnnouncer } from "../kit/announce";

export function LiveRegionHost() {
  const [text, setText] = useState("");
  useEffect(() => {
    if (Platform.OS !== "web") return;
    return registerWebAnnouncer((next) => {
      // Cleared first so the same words announce again when they recur.
      setText("");
      requestAnimationFrame(() => setText(next));
    });
  }, []);
  if (Platform.OS !== "web") return null;
  return (
    <View pointerEvents="none" style={styles.hidden} accessibilityLiveRegion="polite" role="status">
      <Text>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 } });
