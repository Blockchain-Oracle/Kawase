// A new conversation: a greeting by time of day (with the @handle once there is one), the glass orb, and a 2×2 grid
// of suggestion tiles that change with the person's state — a guest sees what Kawase does and how to start, an
// account on testnet starts with test money, an account on mainnet starts with buying, sending, earning and trading.
// Tiles are prompts: the agent answers from the capability registry, so a tile never promises something the network
// can't do (rule R2). Sign-in opens in place and the conversation stays.
import { ArrowUpRight, CandlestickChart, LogIn, Sparkles, Sprout, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { MOTION } from "@kawase/config";
import { arcIdentity } from "@kawase/identity";
import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { Mark } from "@kawase/ui-native/components/mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { tapFeedback } from "@/feedback/feedback";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

const MARK_SIZE = 44;
const TILE_MARK = 28;
const MORNING_FROM = 5;
const AFTERNOON_FROM = 12;
const EVENING_FROM = 18;

type Tile = { key: string; title: string; prompt?: string; icon?: LucideIcon; mark?: string; onPress?: () => void };

export function EmptyThread({ onAsk }: { onAsk: (prompt: string) => void }) {
  const { t } = useT();
  const reduced = useReducedMotionLive();
  const { user, status } = useSession();
  const signIn = useSignIn();
  const network = user?.activeNetwork ?? "testnet";
  const ids = arcIdentity(network);
  const hour = new Date().getHours();
  const greeting =
    hour >= EVENING_FROM || hour < MORNING_FROM
      ? t("chatHome.greetEvening")
      : hour >= AFTERNOON_FROM
        ? t("chatHome.greetAfternoon")
        : t("chatHome.greetMorning");
  const name = user?.handle ? `@${user.handle}` : undefined;

  const ask = (key: string, title: string, prompt: string, extra: Partial<Tile> = {}): Tile => ({ key, title, prompt, ...extra });
  const whatCanYouDo = ask("what", t("chatHome.tileWhat"), t("home.chipWhatCanYouDo"), { icon: Sparkles });
  const send = ask("send", t("chatHome.tileSend"), t("chatHome.tileSendPrompt"), { icon: ArrowUpRight });
  const earn = ask("earn", t("chatHome.tileEarn"), t("chatHome.tileEarnPrompt"), { icon: Sprout });
  const trade = ask("trade", t("chatHome.tileTrade"), t("chatHome.tileTradePrompt"), { icon: CandlestickChart });
  const testMoney = ask("test", t("chatHome.tileTest"), t("home.chipTestUsdc"), { mark: ids.usdc });
  const buy = ask("buy", t("chatHome.tileBuy"), t("chatHome.tileBuyPrompt"), { mark: ids.usdc });
  const signInTile: Tile = { key: "sign-in", title: t("chatHome.tileSignIn"), icon: LogIn, onPress: signIn.open };

  const tiles: Tile[] =
    status !== "account"
      ? [whatCanYouDo, testMoney, trade, signInTile]
      : network === "testnet"
        ? [testMoney, send, earn, whatCanYouDo]
        : [buy, send, earn, trade];

  return (
    <View className="flex-1 justify-end gap-6 px-5 pb-4">
      <View className="items-start gap-3">
        <KawaseMark size={MARK_SIZE} />
        <View className="gap-1">
          <Text className={cn("font-display text-foreground text-[28px] leading-[34px] font-bold", TEXT_START)}>
            {name ? `${greeting}, ${name}` : greeting}
          </Text>
          <Text className={cn("text-muted-foreground text-base", TEXT_START)}>{t("chatHome.greetSub")}</Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-3">
        {tiles.map((tile, index) => (
          <Animated.View
            key={tile.key}
            entering={reduced ? undefined : FadeInDown.delay(index * MOTION.tileStaggerMs).duration(MOTION.sheetMs)}
            className="basis-[47%] grow"
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                tapFeedback("selection");
                if (tile.onPress) tile.onPress();
                else if (tile.prompt) onAsk(tile.prompt);
              }}
              className="bg-card border-border active:opacity-80 min-h-[104px] justify-between gap-3 rounded-[22px] border p-4"
            >
              {tile.mark ? (
                <Mark entity={tile.mark} size={TILE_MARK} />
              ) : tile.icon ? (
                <View className="bg-secondary size-8 items-center justify-center rounded-full">
                  <Icon as={tile.icon} className="text-foreground size-[18px]" />
                </View>
              ) : null}
              <Text className={cn("text-foreground text-[15px] leading-5 font-semibold", TEXT_START)} numberOfLines={2}>
                {tile.title}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}
