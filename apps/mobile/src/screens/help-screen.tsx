// Help & trust (B2-3; plan §A.4 14 "help and trust", S "Friction and trust"): in plain words, what Kawase can and
// can't do with the person's money (the allowance they signed, caps, pause, revoke), where the money lives (their own
// wallet, the key Turnkey keeps, the 7702 code on their address), how to leave without Kawase (export the wallet, the
// Arc network details for any other wallet), whether Kawase is working right now (the live status), and where to
// read more or ask (the docs, a problem report, the chat). Rows are the item-action list (21st 28284 twin).
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { BookOpen, Bug, Code2, Copy, ExternalLink, KeyRound, LogOut, MessageCircle, PauseCircle, ShieldCheck, SlidersHorizontal, Wallet } from "lucide-react-native";
import * as React from "react";
import { Linking, Pressable, View } from "react-native";
import { toast } from "sonner-native";
import { arc, arcTestnet } from "viem/chains";

import type { StatusView } from "@kawase/api-client";
import { PUBLIC_LINKS } from "@kawase/config";
import { ItemActionList } from "@kawase/ui-native/components/item-action-list";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { StatusCard } from "@/chat/insight-cards";
import { useT } from "@/i18n";
import { shortAddress } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const COPY_HIT_SLOP = 12;
const LTR = { writingDirection: "ltr", textAlign: "left" } as const;

export function HelpScreen() {
  const { t } = useT();
  const router = useRouter();
  const { user, status: session } = useSession();
  const { wallet } = useWalletStatus();
  const [status, setStatus] = React.useState<StatusView | null>();
  const network = user?.activeNetwork ?? "testnet";
  const chain = network === "mainnet" ? arc : arcTestnet;
  const account = session === "account";

  React.useEffect(() => {
    void api
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    toast(t("help.copied"));
  };
  const open = (url: string) => void Linking.openURL(url);
  const icon = (as: typeof Wallet, tone = "text-foreground") => <Icon as={as} className={cn("size-4", tone)} />;
  const rpc = chain.rpcUrls.default.http[0] ?? "";
  const explorer = chain.blockExplorers?.default.url ?? "";
  const networkName = network === "mainnet" ? t("network.arc") : t("network.arcTestnet");

  return (
    <Page title={t("help.title")}>
      <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{t("help.intro")}</Text>

      <Section title={t("help.canTitle")}>
        <ItemActionList
          items={[
            { key: "allowance", media: icon(ShieldCheck), title: t("help.allowanceTitle"), description: t("help.allowanceBody") },
            { key: "asks", media: icon(KeyRound), title: t("help.asksTitle"), description: t("help.asksBody") },
            {
              key: "pause",
              media: icon(PauseCircle),
              title: t("help.pauseTitle"),
              description: t("help.pauseBody"),
              action: { label: t("help.limits"), onPress: () => router.push(account ? "/limits" : "/wallet") },
            },
            { key: "never", media: icon(SlidersHorizontal), title: t("help.neverTitle"), description: t("help.neverBody") },
          ]}
        />
      </Section>

      <Section title={t("help.whereTitle")}>
        <ItemActionList
          items={[
            {
              key: "wallet",
              media: icon(Wallet),
              title: t("help.walletTitle"),
              description: wallet?.address ? `${t("help.walletBody")} ${shortAddress(wallet.address)}` : t("help.walletBody"),
              ...(wallet?.address ? { action: { label: t("help.copy"), onPress: () => void copy(wallet.address!) } } : {}),
            },
            { key: "key", media: icon(KeyRound), title: t("help.keyTitle"), description: t("help.keyBody") },
            { key: "code", media: icon(Code2), title: t("help.codeTitle"), description: t("help.codeBody") },
          ]}
        />
      </Section>

      <Section title={t("help.leaveTitle")}>
        <ItemActionList
          items={[
            {
              key: "export",
              media: icon(LogOut),
              title: t("help.exportTitle"),
              description: t("help.exportBody"),
              ...(account ? { action: { label: t("help.export"), onPress: () => router.push("/account/export") } } : {}),
            },
            { key: "any", media: icon(Wallet), title: t("help.anyWalletTitle"), description: t("help.anyWalletBody", { network: networkName }) },
          ]}
        />
        <View className="bg-card border-border gap-2 rounded-2xl border p-4">
          {[
            { label: t("help.chainId"), value: String(chain.id) },
            { label: t("help.rpc"), value: rpc },
            { label: t("help.explorer"), value: explorer },
            { label: t("help.gasToken"), value: "USDC" },
          ].map((row) => (
            <View key={row.label} className="flex-row items-center gap-3">
              <Text className={cn("text-muted-foreground w-24 text-xs", TEXT_START)}>{row.label}</Text>
              <Text selectable numberOfLines={1} className="text-foreground min-w-0 flex-1 font-mono text-xs" style={LTR}>
                {row.value}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${t("help.copy")} ${row.label}`} hitSlop={COPY_HIT_SLOP} onPress={() => void copy(row.value)}>
                <Icon as={Copy} className="text-muted-foreground size-3.5" />
              </Pressable>
            </View>
          ))}
        </View>
      </Section>

      <Section title={t("help.statusTitle")}>
        {status ? (
          <StatusCard output={status} />
        ) : (
          <Text className={cn("text-muted-foreground px-1 text-sm", TEXT_START)}>{status === undefined ? t("common.loading") : t("help.statusUnread")}</Text>
        )}
      </Section>

      <Section title={t("help.askTitle")}>
        <ItemActionList
          items={[
            { key: "chat", media: icon(MessageCircle), title: t("help.chatTitle"), description: t("help.chatBody"), action: { label: t("help.open"), onPress: () => router.push("/chat") } },
            { key: "docs", media: icon(BookOpen), title: t("help.docsTitle"), description: PUBLIC_LINKS.docs.replace("https://", ""), action: { label: t("help.open"), onPress: () => open(PUBLIC_LINKS.docs) } },
            {
              key: "report",
              media: icon(Bug),
              title: t("help.reportTitle"),
              description: t("help.reportBody"),
              action: { label: t("help.open"), onPress: () => open(PUBLIC_LINKS.support) },
            },
            { key: "status", media: icon(ExternalLink), title: t("help.statusLinkTitle"), description: `${PUBLIC_LINKS.api.replace("https://", "")}/status`, action: { label: t("help.open"), onPress: () => open(`${PUBLIC_LINKS.api}/status`) } },
          ]}
        />
      </Section>
    </Page>
  );
}
