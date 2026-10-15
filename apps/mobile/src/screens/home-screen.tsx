// Home IS the agent (D37 decision 1; plan §D). Top to bottom:
//   1. the header (avatar · network · inbox) and the one hero figure: the balance, rolling, with today's change and the
//      week's sparkline; tapping it opens the portfolio sheet (assets, hidden, other chains + Bring to Arc, positions);
//   2. the live run: what the person just asked, drawn as one object (the run card: understand → race → approve →
//      steps → receipt), with a compact strip pinned to the top while it scrolls out of view;
//   3. the feed of what Kawase did — Done · Held · Skipped · Watching (with a countdown ring) · Found — day-grouped,
//      filter chips with counts, each row a venue mark, the outcome, one line and the time; a row opens its detail
//      (the race it came from and its receipt);
//   4. the composer: a capsule beside the + at rest (its words walk through what Kawase can do, the mic opens voice),
//      tucked behind the dock while you read down and back when you scroll up; tapped, it opens into the typing bar
//      with past conversations and the suggestions Bring USDC to Arc · Put idle USDC to work · Buy $50 · Send to a
//      contact · Bridge.
// A guest sees real markets, the composer and "your money appears here after you sign in" — never a fake balance.
// A wide desktop stage is a fixed grid (Abu, 10-15): the balance and the feed's filters stay put in the middle of the
// agent's column and only the feed scrolls under them; Trending on Arc stands still beside it; a guest's column is the
// sign-in stage, centred.
// Every surface has its designed states (skeletons held 300 ms, empty with the next action, errors that say what still
// works, stale values marked). `?ask=` (Ask Kawase from another screen) puts that request in the composer, unsent;
// `?run=` (setup's first job) runs it at once.
import * as Crypto from "expo-crypto";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AgentFeedItem } from "@kawase/api-client";
import { useStageFrame } from "@kawase/ui-native/lib/stage";
import { useWide, WIDE_COLUMN_PX } from "@kawase/ui-native/lib/wide";

import {
  Button,
  type Diagnosis,
  EmptyState,
  ErrorState,
  SectionLabel,
  ShimmerText,
  SPACE,
  StaleTick,
  TIMING,
  TYPE,
  useTheme,
} from "@/components/kit";
import { TabHeaderEnd, TabHeaderStart } from "@/components/tab-header";
import { ThreadHistorySheet } from "@/chat/thread-history-sheet";
import { useFund } from "@/fund/fund-provider";
import { BalanceHero } from "@/home/balance-hero";
import { FeedDetailSheet } from "@/home/feed-detail-sheet";
import { FeedFilters, FeedTimeline, rowsFor, type FeedFilter } from "@/home/feed-timeline";
import { BottomFade } from "@/home/bottom-fade";
import { HomeComposer, useComposerClearance } from "@/home/home-composer";
import { HomeRun, type HomeRunHandle, type RunStatus } from "@/home/home-run";
import { MarketsGlance, SignInPlate, SignInStage } from "@/home/markets-glance";
import { PortfolioSheet } from "@/home/portfolio-sheet";
import { useRunPointer } from "@/home/run-store";
import { useAgentFeed } from "@/home/use-agent-feed";
import { useLauncherScroll } from "@/home/use-launcher-scroll";
import { useT } from "@/i18n";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { useSession } from "@/session/session-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";

/** The feed came back without the wallet history (a source timed out): a server-side miss worth one retry. */
const HISTORY_UNREAD: Diagnosis = { kind: "server", retryable: true };
/** Home shows a glance; Activity has the whole feed. */
const FEED_ROWS = 12;
const EMPTY_PROMPT_KEY = "feed.home.emptyPrompt";
/** The live markets column beside the feed on a wide desktop stage. */
const SIDE_COLUMN_PX = 340;
/** The stage width from which the feed (560 px at least) and the markets column fit side by side, with the gutters. */
const BESIDE_MIN_STAGE_PX = 1000;
/** The feed under the centred head: a centred column on plates, like Activity's (Abu 10-15: "shift them to the middle"). */
const LIST_MAX_PX = 600;
/** The grid's gutters, one on each side. */
const GUTTERS = 2;

export function HomeScreen() {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { status, user, stale } = useSession();
  const account = status === "account";
  const network = user?.activeNetwork ?? "testnet";
  const portfolio = usePortfolio();
  const emptyWallet = account && portfolio.portfolio !== undefined && portfolio.portfolio.totalUsd === 0;
  const stage = useStageFrame();
  const beside = wide && (stage?.width ?? 0) >= BESIDE_MIN_STAGE_PX;
  const wallet = useWalletStatus();
  const fund = useFund();
  const { ask, run: runNow } = useLocalSearchParams<{ ask?: string; run?: string }>();

  const run = useRunPointer(network);
  const runRef = React.useRef<HomeRunHandle>(null);
  const [runStatus, setRunStatus] = React.useState<RunStatus | null>(null);
  const runBusy = runStatus?.busy === true;
  const feed = useAgentFeed({ live: runBusy || runStatus?.phase === "steps" });

  const [draft, setDraft] = React.useState("");
  const [filter, setFilter] = React.useState<FeedFilter>("all");
  const [open, setOpen] = React.useState<AgentFeedItem | null>(null);
  const [portfolioOpen, setPortfolioOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const composerClearance = useComposerClearance();

  // Fresh balances whenever Home comes back into view (after a trade, a switch, a fix).
  const refreshPortfolio = portfolio.refresh;
  const refreshWallet = wallet.refresh;
  useFocusEffect(
    React.useCallback(() => {
      void refreshPortfolio();
      void refreshWallet();
    }, [refreshPortfolio, refreshWallet]),
  );
  // A receipt landed: the balance rolls to its new value.
  React.useEffect(() => {
    if (runStatus?.phase === "receipt") void refreshPortfolio();
  }, [runStatus?.phase, refreshPortfolio]);

  // A job started elsewhere (setup's "Give Kawase its first job") runs here at once, as the run card.
  const startedRun = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!runNow || startedRun.current === runNow) return;
    startedRun.current = runNow;
    run.start(Crypto.randomUUID(), runNow);
    // Off the address too, so a reload never asks again.
    router.replace("/");
  }, [runNow, router, run]);

  // Ask Kawase from another screen: the request waits in the composer for the person's send.
  React.useEffect(() => {
    if (!ask) return;
    setDraft(ask);
    router.setParams({ ask: undefined });
  }, [ask, router]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft("");
    // A follow-up to the run on screen continues its conversation; otherwise a new run starts.
    if (run.pointer && runRef.current) runRef.current.send(trimmed);
    else run.start(Crypto.randomUUID(), trimmed);
  };

  // The live strip: pinned to the top while the run card is scrolled out of view.
  const scroller = React.useRef<Animated.ScrollView>(null);
  const scrollY = useSharedValue(0);
  const [runBottom, setRunBottom] = React.useState(0);
  const [scrolledPast, setScrolledPast] = React.useState(false);
  // Reading down tucks the composer behind the dock; scrolling up brings it back.
  const launcher = useLauncherScroll(scrollY);
  const onScrollEnd = (y: number) => setScrolledPast(runBottom > 0 && y > runBottom);

  const rows = rowsFor(feed.feed, filter);
  const hasRows = rowsFor(feed.feed, "all").length > 0;
  // "Nothing yet" only when the history was read: an unread history with no rows is a failure to say, never an empty
  // wallet (the device pass found both lines at once on a cold open).
  const historyUnread = !!feed.feed && feed.feed.partial.includes("activity") && !hasRows;
  const seeAll =
    rows.length > FEED_ROWS ? (
      <Button size="sm" block={false} variant="ghost" label={t("feed.home.seeAll")} onPress={() => router.navigate("/activity")} />
    ) : null;
  // The feed in two parts, so a desktop stage can hold the head still and scroll only the rows.
  const feedHead = (
    <>
      <View style={[styles.sectionHead, beside ? styles.centered : null]}>
        <SectionLabel>{t("feed.home.feedTitle")}</SectionLabel>
        {feed.error && feed.asOf ? <StaleTick asOf={feed.asOf} reason="refresh-failed" compact /> : null}
        {beside ? null : (
          <>
            <View style={styles.grow} />
            {seeAll}
          </>
        )}
      </View>
      {feed.feed && hasRows ? <FeedFilters feed={feed.feed} value={filter} onChange={setFilter} centered={beside} /> : null}
      {/* Some rows read: a quiet note under them. None read because the history failed: the retry strip below says it. */}
      {feed.feed && feed.feed.partial.length > 0 && !historyUnread ? (
        <Text style={[TYPE.caption, { color: color.text3 }, beside ? styles.centerText : null]}>{t("feed.home.partial")}</Text>
      ) : null}
    </>
  );
  const feedBody =
    (!feed.feed && feed.error) || historyUnread ? (
      <ErrorState
        diagnosis={feed.error ?? HISTORY_UNREAD}
        retry={() => void feed.refresh()}
        stillWorks={t("feed.home.feedStillWorks")}
        variant="strip"
      />
    ) : feed.feed && !hasRows ? (
      <EmptyState
        why={t("feed.home.emptyWhy")}
        action={{ label: t("feed.home.emptyAction"), onPress: () => submit(t(EMPTY_PROMPT_KEY)) }}
        size="inline"
      />
    ) : (
      <FeedTimeline feed={feed.feed} filter={filter} limit={FEED_ROWS} onOpen={setOpen} plated={beside} />
    );
  const feedSection = account ? (
    <View style={styles.section}>
      {feedHead}
      {feedBody}
    </View>
  ) : null;

  const runSection = run.pointer ? (
    <View onLayout={(event) => setRunBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}>
      <HomeRun
        key={run.pointer.threadId}
        ref={runRef}
        pointer={run.pointer}
        onAsked={run.asked}
        onClose={() => {
          run.clear();
          setRunStatus(null);
        }}
        onStatus={setRunStatus}
        onRestore={setDraft}
      />
    </View>
  ) : null;

  const hero = account ? (
    <BalanceHero
      portfolio={portfolio.portfolio}
      loading={portfolio.loading}
      failedAt={portfolio.error || stale ? portfolio.updatedAt : undefined}
      onOpen={() => setPortfolioOpen(true)}
      centered={beside}
    />
  ) : (
    <SignInPlate />
  );

  const strip =
    scrolledPast && runStatus ? (
      <Animated.View
        entering={FadeIn.duration(TIMING.selection)}
        exiting={FadeOut.duration(TIMING.press)}
        style={[styles.strip, { top: beside ? SPACE.xs : insets.top + SPACE.xs }]}
      >
        <RunStrip status={runStatus} onPress={() => scroller.current?.scrollTo({ y: 0, animated: true })} />
      </Animated.View>
    ) : null;

  // A desktop stage wide enough for both columns: a fixed grid. The agent's column holds its head still (the balance
  // and the feed's filters, centred) and scrolls only the run and the rows; the live markets stand beside it. A guest's
  // column is the sign-in stage, in the middle of the room the balance will take.
  const besideGrid = (
    <View style={styles.grid}>
      {account ? (
        <View style={styles.mainColumn}>
          <View style={styles.fixedHead}>
            {hero}
            <View style={styles.section}>{feedHead}</View>
          </View>
          <View style={styles.fill}>
            <Animated.ScrollView
              ref={scroller}
              onScroll={launcher.onScroll}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(event) => onScrollEnd(event.nativeEvent.contentOffset.y)}
              onScrollEndDrag={(event) => onScrollEnd(event.nativeEvent.contentOffset.y)}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.list, { paddingBottom: composerClearance }]}
            >
              {runSection}
              {feedBody}
              {seeAll ? <View style={styles.centered}>{seeAll}</View> : null}
            </Animated.ScrollView>
            {/* Rows fade as they pass under the fixed head instead of being cut by a hard edge. */}
            <BottomFade height={SPACE.xl} color={color.background} edge="top" />
            {strip}
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.mainColumn}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.guestStage, { paddingBottom: composerClearance }]}
        >
          <SignInStage />
        </ScrollView>
      )}
      <ScrollView
        style={styles.sideColumn}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.sideContent, { paddingBottom: composerClearance }]}
      >
        <MarketsGlance />
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.page, { backgroundColor: color.background }]}>
      {wide ? null : (
        <View style={[styles.header, { paddingTop: insets.top + SPACE.md }]}>
          <TabHeaderStart />
          <View style={styles.grow} />
          <TabHeaderEnd />
        </View>
      )}

      {beside ? (
        besideGrid
      ) : (
        <Animated.ScrollView
          ref={scroller}
          onScroll={launcher.onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(event) => onScrollEnd(event.nativeEvent.contentOffset.y)}
          onScrollEndDrag={(event) => onScrollEnd(event.nativeEvent.contentOffset.y)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, wide ? styles.wideContent : null, { paddingBottom: composerClearance }]}
        >
          {hero}
          {runSection}
          {feedSection}
          {/* Guests, and an account with nothing in it yet, see the live markets (a new account's Home was emptier than a guest's). */}
          {!account || emptyWallet ? <MarketsGlance /> : null}
        </Animated.ScrollView>
      )}

      {beside ? null : strip}

      <BottomFade height={composerClearance} color={color.background} />
      <HomeComposer
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        busy={runBusy}
        busyLabel={runStatus ? t(`feed.run.strip_${runStatus.phase}`) : undefined}
        onStop={() => runRef.current?.stop()}
        onHistory={() => setHistoryOpen(true)}
        shown={launcher.shown}
        showChips={!run.pointer}
      />

      {portfolioOpen ? (
        <PortfolioSheet
          portfolio={portfolio.portfolio}
          loading={portfolio.loading}
          error={portfolio.error}
          onRetry={() => void portfolio.refresh()}
          onAddMoney={fund.open}
          onVisibility={portfolio.setVisibility}
          onClose={() => setPortfolioOpen(false)}
        />
      ) : null}
      {open ? <FeedDetailSheet item={open} onClose={() => setOpen(null)} onAsk={submit} /> : null}
      {historyOpen ? (
        <ThreadHistorySheet
          onClose={() => setHistoryOpen(false)}
          onOpen={(thread) => router.push({ pathname: "/chat", params: { thread } })}
          onNew={() => run.clear()}
          current={run.pointer?.threadId}
        />
      ) : null}
    </View>
  );
}

/** The run, compact: its phase as a live verb and the person's words, pinned while the card is out of view. */
function RunStrip({ status, onPress }: { status: RunStatus; onPress: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const verb = t(`feed.run.strip_${status.phase}`);
  const live = status.busy || status.phase === "race" || status.phase === "steps";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t("feed.run.stripHint")}
      onPress={onPress}
      style={[styles.stripPlate, { backgroundColor: color.glassOpaque }]}
    >
      {live ? (
        <ShimmerText style={[TYPE.caption, { color: color.ink }]}>{verb}</ShimmerText>
      ) : (
        <Text style={[TYPE.caption, { color: color.ink }]}>{verb}</Text>
      )}
      <Text numberOfLines={1} style={[TYPE.caption, styles.grow, { color: color.text3 }]}>
        {status.asked}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lgPlus,
    paddingBottom: SPACE.xs,
  },
  grow: { flex: 1 },
  content: { gap: SPACE.xl, paddingHorizontal: SPACE.lgPlus, paddingTop: SPACE.sm },
  wideContent: { width: "100%", maxWidth: WIDE_COLUMN_PX, alignSelf: "center", paddingTop: SPACE.xxl },
  grid: {
    flex: 1,
    flexDirection: "row",
    gap: SPACE.xxl,
    width: "100%",
    maxWidth: WIDE_COLUMN_PX + SIDE_COLUMN_PX + SPACE.xxl + SPACE.lgPlus * GUTTERS,
    alignSelf: "center",
    paddingHorizontal: SPACE.lgPlus,
  },
  mainColumn: { flex: 1, minWidth: 0 },
  fixedHead: { gap: SPACE.xl, paddingTop: SPACE.xxl, paddingBottom: SPACE.md },
  fill: { flex: 1 },
  list: { gap: SPACE.xl, paddingTop: SPACE.md, width: "100%", maxWidth: LIST_MAX_PX, alignSelf: "center" },
  guestStage: { flexGrow: 1, justifyContent: "center", paddingTop: SPACE.xxl },
  sideColumn: { width: SIDE_COLUMN_PX, flexGrow: 0 },
  sideContent: { paddingTop: SPACE.xxl },
  centered: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACE.sm },
  centerText: { textAlign: "center" },
  section: { gap: SPACE.md },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  strip: { position: "absolute", start: SPACE.lgPlus, end: SPACE.lgPlus },
  stripPlate: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    borderRadius: SPACE.xl,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
});
