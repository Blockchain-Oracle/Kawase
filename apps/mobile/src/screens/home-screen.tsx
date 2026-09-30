// The Koe stage. Voice and chat arrive in later stages; for now the orb, the state, and the way into the
// wallet, sign-in and settings.
import { useRouter } from "expo-router";
import { Settings2, Wallet } from "lucide-react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { amount, formatAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { NetworkChip, TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { tokens } from "@kawase/ui-tokens";

import { Orb } from "@/components/orb";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const IDLE_LEVEL = 0.2;

export function HomeScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const { status, user } = useSession();
  const { wallet } = useWalletStatus();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const balance = wallet?.networks[network]?.usdcBalance;
  const walletReady = Boolean(wallet?.networks[network]?.setUp && wallet?.networks[network]?.allowance);

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center justify-between px-5 pt-3" style={testnet ? undefined : { paddingTop: insets.top + EDGE_INSET }}>
        <NetworkChip label={testnet ? t("network.arcTestnet") : t("network.arc")} />
        <View className="flex-row items-center gap-3">
          {balance ? <Amount className="text-muted-foreground text-sm">{formatAmount(amount("USDC", BigInt(balance)), locale)}</Amount> : null}
          <Button variant="secondary" size="icon" accessibilityLabel={t("settings.title")} className="size-11" onPress={() => router.push("/settings")}>
            <Icon as={Settings2} className="size-5" />
          </Button>
        </View>
      </View>

      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Orb colors={tokens.orb[network]} level={IDLE_LEVEL} accessibilityLabel={t("common.appName")} className="w-56" />
        <StateLabel>{t("common.appName")}</StateLabel>
        <Text className="font-display text-center text-[26px] font-medium leading-8 tracking-tight">{t("home.tapToTalk")}</Text>
        <Text className="text-muted-foreground text-center text-sm">{t("home.comingSoon")}</Text>
      </View>

      <View className="gap-2 px-5" style={{ paddingBottom: insets.bottom + EDGE_INSET }}>
        {status === "guest" ? (
          <Button className="h-14" onPress={() => router.push("/sign-in")}>
            <Text className="text-base font-semibold">{t("signIn.title")}</Text>
          </Button>
        ) : null}
        {status === "account" && !walletReady ? (
          <Button className="h-14" onPress={() => router.push("/wallet")}>
            <Icon as={Wallet} className="text-primary-foreground size-5" />
            <Text className="text-base font-semibold">{t("wallet.title")}</Text>
          </Button>
        ) : null}
        {status === "account" && walletReady ? (
          <Button variant="secondary" className="h-12" onPress={() => router.push("/wallet")}>
            <Icon as={Wallet} className="size-5" />
            <Text>{t("wallet.title")}</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
