// "Your card" (Abu, 10-16: FOMO's share card, in Kawase's own design): the story of the person's money over 7 days,
// 30 days or all time, drawn from their own wallet on the current network, with Share image everywhere and the film as
// an MP4 on the web. Reached from Activity's header, Home's balance, the token page, a position, and the agent ("share
// my month"). Loading draws the card's own shape; a guest, an empty period and a failed read each say why and what to do.
import { useLocalSearchParams, useRouter } from "expo-router";
import { Film, RotateCcw, Share2, Volume2, VolumeX, X } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useWide } from "@kawase/ui-native/lib/wide";

import { Button } from "@/components/kit/Button";
import { Icon } from "@/components/kit/icons";
import { Segmented } from "@/components/kit/Segmented";
import { EmptyState } from "@/components/kit/states";
import { SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";
import { feedbackPreferences } from "@/feedback/preferences";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { USD_FX } from "@/portfolio/format";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { PageHeader, PhoneScroll } from "@/trade/page-frame";

import type { CardHandle } from "./card-handle";
import { ShareCardView } from "./card-view";
import { SHARE_PERIODS, type SharePeriod } from "./model";
import { saveCardFile, shareCardFile } from "./share-actions";
import { useShareCard } from "./use-share-card";
import { CardSkeleton } from "./card-skeleton";
import { cardWords } from "./words";

const CARD_MAX = 480;
const COLUMN_MAX = 560;
const PERCENT = 100;
const GUTTERS = 2;
const ENTER_MS = 240;

const isPeriod = (value: unknown): value is SharePeriod => typeof value === "string" && (SHARE_PERIODS as readonly string[]).includes(value);

type VideoState = { phase: "idle" } | { phase: "making"; share: number } | { phase: "done" } | { phase: "unavailable" } | { phase: "failed" };

export function ShareCardScreen() {
  const { t } = useT();
  const router = useRouter();
  const wide = useWide();
  const { color } = useTheme();
  const { locale } = useLocale();
  const params = useLocalSearchParams<{ period?: string; token?: string; position?: string }>();
  const [period, setPeriod] = React.useState<SharePeriod>(isPeriod(params.period) ? params.period : "30d");
  // "5042002:0x89b5…" from a token page; a position's id from its page.
  const token = React.useMemo(() => {
    const [chainId, address] = (params.token ?? "").split(":");
    return chainId && address && /^0x[0-9a-fA-F]{40}$/.test(address) ? { chainId: Number(chainId), address } : undefined;
  }, [params.token]);
  const state = useShareCard({ period, token, position: params.position });
  const { user } = useSession();
  const { portfolio } = usePortfolio();
  const fund = useFund();
  const signIn = useSignIn();
  const card = React.useRef<CardHandle>(null);
  const [width, setWidth] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [video, setVideo] = React.useState<VideoState>({ phase: "idle" });
  const abort = React.useRef<AbortController | null>(null);
  // The film plays with its sound when the person's sounds are on; the speaker in the header turns it off or, when the
  // browser held it back (a page opened straight from a link has had no tap yet), plays the film again with sound.
  const [sound, setSound] = React.useState(() => feedbackPreferences().sounds);
  const [soundBlocked, setSoundBlocked] = React.useState(false);
  const fx = portfolio?.fx ?? USD_FX;
  const handle = user?.handle ? `@${user.handle}` : (user?.email?.split("@")[0] ?? t("common.guest"));
  const words = React.useMemo(
    () => (state.status === "ready" ? cardWords({ card: state.card, handle, fx, locale, t }) : null),
    [state, handle, fx, locale, t],
  );
  // The column's measured width, or until it is measured the window's (so the card never waits on a layout pass).
  const window = useWindowDimensions();
  const cardWidth = Math.min(CARD_MAX, width || Math.min(COLUMN_MAX, window.width - SPACE.inset * GUTTERS));
  React.useEffect(() => {
    abort.current?.abort();
    setVideo({ phase: "idle" });
    setNote(null);
  }, [period]);
  React.useEffect(() => () => abort.current?.abort(), []);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/activity"));

  const shareImage = async () => {
    if (!card.current || !words) return;
    setBusy(true);
    setNote(null);
    try {
      const file = await card.current.image();
      const outcome = await shareCardFile(file, t("shareCard.title"), words.shareText);
      if (outcome === "saved") setNote(t("shareCard.imageSaved"));
      fire("confirm");
    } catch {
      setNote(t("shareCard.errorBody"));
    } finally {
      setBusy(false);
    }
  };

  const makeVideo = async () => {
    const make = card.current?.video;
    if (!make || !words) return;
    const controller = new AbortController();
    abort.current = controller;
    setVideo({ phase: "making", share: 0 });
    try {
      const file = await make((share) => setVideo({ phase: "making", share }), controller.signal);
      await saveCardFile(file, t("shareCard.title"), words.shareText);
      setVideo({ phase: "done" });
      fire("confirm");
    } catch (error) {
      if (controller.signal.aborted) return setVideo({ phase: "idle" });
      setVideo({ phase: error instanceof Error && error.name === "VideoUnavailable" ? "unavailable" : "failed" });
    }
  };

  const periods = SHARE_PERIODS.map((value) => ({
    value,
    label: t(value === "7d" ? "shareCard.period7d" : value === "30d" ? "shareCard.period30d" : "shareCard.periodAll"),
  }));

  let body: React.ReactNode;
  if (state.status === "guest")
    body = <EmptyState why={t("shareCard.guestTitle")} detail={t("shareCard.guestBody")} action={{ label: t("signIn.title"), onPress: () => signIn.open() }} size="page" />;
  else if (state.status === "empty")
    body = <EmptyState why={t("shareCard.emptyTitle")} detail={t("shareCard.emptyBody")} action={{ label: t("shareCard.emptyAction"), onPress: () => fund.open() }} size="page" />;
  else if (state.status === "error")
    body = <EmptyState why={t("shareCard.errorTitle")} detail={t("shareCard.errorBody")} action={{ label: t("common.retry"), onPress: state.retry }} size="page" />;
  else if (state.status === "loading" || !words || cardWidth === 0) body = cardWidth > 0 ? <CardSkeleton width={cardWidth} label={t("shareCard.loading")} /> : null;
  else
    body = (
      <Animated.View entering={FadeIn.duration(ENTER_MS)} style={styles.cardBlock}>
        <ShareCardView ref={card} card={state.card} words={words} fx={fx} seed={user?.id ?? "guest"} width={cardWidth} sound={sound} onSoundBlocked={setSoundBlocked} />
        <View style={[styles.actions, { width: cardWidth }]}>
          <Button label={t("shareCard.shareImage")} leading={<Icon icon={Share2} size={18} />} loading={busy} onPress={() => void shareImage()} />
          {Platform.OS === "web" ? (
            video.phase === "making" ? (
              <View style={[styles.making, { backgroundColor: color.raised2 }]}>
                <View style={[styles.makingFill, { width: `${Math.round(video.share * PERCENT)}%`, backgroundColor: color.primaryWash }]} />
                <Text style={[TYPE.buttonLabel, styles.grow, { color: color.ink }]} numberOfLines={1}>
                  {t("shareCard.makingVideo", { pct: Math.round(video.share * PERCENT) })}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} hitSlop={SPACE.sm} onPress={() => abort.current?.abort()}>
                  <Icon icon={X} size={18} tint={color.text2} />
                </Pressable>
              </View>
            ) : (
              <Button variant="secondary" label={t("shareCard.saveVideo")} leading={<Icon icon={Film} size={18} />} onPress={() => void makeVideo()} />
            )
          ) : null}
          {note || video.phase === "done" || video.phase === "unavailable" || video.phase === "failed" ? (
            <Text style={[TYPE.meta, styles.center, { color: color.text2 }]}>
              {video.phase === "done" ? t("shareCard.videoSaved") : video.phase === "unavailable" ? t("shareCard.videoUnavailable") : video.phase === "failed" ? t("shareCard.videoFailed") : note}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    );

  return (
    <View style={[styles.page, { backgroundColor: color.background }]}>
      <PageHeader
        title={t("shareCard.title")}
        subtitle={t("shareCard.subtitle")}
        onBack={back}
        trailing={
          Platform.OS === "web" && state.status === "ready" ? (
            <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={t("shareCard.sound")}
              accessibilityState={{ checked: sound && !soundBlocked }}
              onPress={() => {
                fire("tick");
                if (soundBlocked || !sound) {
                  setSound(true);
                  setSoundBlocked(false);
                  card.current?.replay();
                } else setSound(false);
              }}
              hitSlop={SPACE.sm}
              style={({ pressed }) => [styles.replay, { backgroundColor: pressed ? color.rowPressed : soundBlocked ? color.primaryWash : color.raised2 }]}
            >
              <Icon icon={sound && !soundBlocked ? Volume2 : VolumeX} size={18} tint={color.ink} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("shareCard.replay")}
              onPress={() => {
                fire("tick");
                card.current?.replay();
              }}
              hitSlop={SPACE.sm}
              style={({ pressed }) => [styles.replay, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
            >
              <Icon icon={RotateCcw} size={18} tint={color.ink} />
            </Pressable>
            </View>
          ) : null
        }
      />
      <PhoneScroll>
        <View style={[styles.column, wide ? styles.columnWide : null]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          {state.status === "guest" || cardWidth === 0 || params.position ? null : (
            <View style={{ width: cardWidth }}>
              <Segmented options={periods} value={period} onChange={setPeriod} label={t("shareCard.title")} />
            </View>
          )}
          {body}
        </View>
      </PhoneScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  column: { width: "100%", maxWidth: COLUMN_MAX, alignSelf: "center", gap: SPACE.lg, alignItems: "center" },
  columnWide: { paddingTop: SPACE.sm },
  cardBlock: { alignItems: "center", gap: SPACE.lg, width: "100%" },
  actions: { gap: SPACE.sm },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, justifyContent: "space-between" },
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  replay: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  headerActions: { flexDirection: "row", gap: SPACE.sm },
  making: { height: 52, borderRadius: 26, overflow: "hidden", flexDirection: "row", alignItems: "center", paddingHorizontal: SPACE.lg, gap: SPACE.sm },
  makingFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
});
