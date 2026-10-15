// The top of a route ticket (swap, move): back, the page title in the condensed face, and on the right which network
// the money is on, in words (Senryo: the mode is never a hue wash; testnet says "Testnet", mainnet "Real money").
import { StyleSheet, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { ChevronLeft } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";

const HALF = 2;

export function TicketHeader({ title, onBack, testnet, embedded = false }: { title: string; onBack: () => void; testnet: boolean; embedded?: boolean }) {
  const { t } = useT();
  const { rtl } = useLocale();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { paddingTop: embedded ? 0 : insets.top + SPACE.md }]}>
      {embedded ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={() => {
            fire("tick");
            onBack();
          }}
          style={[styles.back, { backgroundColor: color.raised2 }]}
        >
          <View style={rtl ? styles.flip : undefined}>
            <Icon icon={ChevronLeft} size={SIZE.icon} />
          </View>
        </Pressable>
      )}
      <Text accessibilityRole="header" numberOfLines={1} style={[TYPE.pageTitle, styles.title, { color: color.ink }]}>
        {title}
      </Text>
      <View style={[styles.mode, { backgroundColor: testnet ? color.networkSurface : color.raised2 }]}>
        <Text style={[TYPE.modeLabel, { color: testnet ? color.network : color.ink }]}>{testnet ? t("network.testnet") : t("network.realMoney")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.inset, paddingBottom: SPACE.sm },
  back: { width: SIZE.touch, height: SIZE.touch, borderRadius: SIZE.touch / HALF, alignItems: "center", justifyContent: "center" },
  flip: { transform: [{ scaleX: -1 }] },
  title: { flex: 1 },
  mode: { height: SIZE.modeCapsuleHeight, borderRadius: SIZE.modeCapsuleHeight / HALF, paddingHorizontal: SPACE.md, justifyContent: "center" },
});
