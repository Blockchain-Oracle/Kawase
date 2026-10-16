// The agent's "share my month" (show_share_card): the card itself, drawn in the conversation from the person's own
// wallet (the film plays on the web), with Share card opening the full page for the image and the video.
import { useRouter } from "expo-router";
import { Share2 } from "lucide-react-native";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/kit/Button";
import { Icon } from "@/components/kit/icons";
import { SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { USD_FX } from "@/portfolio/format";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { useSession } from "@/session/session-provider";

import { CardSkeleton } from "./card-skeleton";
import { ShareCardView } from "./card-view";
import type { SharePeriod } from "./model";
import { shareHref } from "./share-chip";
import { useShareCard } from "./use-share-card";
import { cardWords } from "./words";

/** The card in a chat bubble: narrower than the page's. */
const CHAT_CARD = 300;

export function ShareCardChatCard({ output }: { output: { status: "ready"; period: SharePeriod } }) {
  const { t } = useT();
  const router = useRouter();
  const { color } = useTheme();
  const { locale } = useLocale();
  const { user } = useSession();
  const { portfolio } = usePortfolio();
  const target = React.useMemo(() => ({ period: output.period }), [output.period]);
  const state = useShareCard(target);
  const fx = portfolio?.fx ?? USD_FX;
  const handle = user?.handle ? `@${user.handle}` : (user?.email?.split("@")[0] ?? t("common.guest"));
  const words = React.useMemo(() => (state.status === "ready" ? cardWords({ card: state.card, handle, fx, locale, t }) : null), [state, handle, fx, locale, t]);

  if (state.status === "guest" || state.status === "empty" || state.status === "error") {
    const why = state.status === "guest" ? t("shareCard.guestTitle") : state.status === "empty" ? t("shareCard.emptyTitle") : t("shareCard.errorTitle");
    const detail = state.status === "guest" ? t("shareCard.guestBody") : state.status === "empty" ? t("shareCard.emptyBody") : t("shareCard.errorBody");
    return (
      <View style={[styles.plate, { backgroundColor: color.card }]}>
        <Text style={[TYPE.rowTitle, { color: color.ink }]}>{why}</Text>
        <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{detail}</Text>
      </View>
    );
  }
  return (
    <View style={styles.block}>
      {state.status === "ready" && words ? (
        <ShareCardView card={state.card} words={words} fx={fx} seed={user?.id ?? "guest"} width={CHAT_CARD} />
      ) : (
        <CardSkeleton width={CHAT_CARD} label={t("shareCard.loading")} />
      )}
      <View style={{ width: CHAT_CARD }}>
        <Button
          variant="secondary"
          size="sm"
          label={t("shareCard.open")}
          leading={<Icon icon={Share2} size={16} />}
          disabled={state.status !== "ready"}
          onPress={() => router.push(shareHref({ period: output.period }))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACE.sm },
  plate: { padding: SPACE.lg, borderRadius: SPACE.lg, gap: SPACE.xs },
});
