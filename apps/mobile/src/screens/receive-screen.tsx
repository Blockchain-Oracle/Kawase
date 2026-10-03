// Receive (journey 8, C32 / M04 / S21 / P21): the dotted QR assembling from particles with the Arc mark at the
// centre, the identity row (name · short address · network) whose chevron opens the network selector, the
// "Arc only" warning, Copy and Share. The QR always encodes the live wallet address, never a fixture, and stays
// left-to-right in every language. Without a wallet the page says what to do instead of showing a fake code.
// "Ask for an amount" turns the code into a request: any token on Arc and an amount, as an EIP-681 transfer URI that
// any wallet fills in (gaps.md G10); a token page's Receive starts it on that token.
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronLeft, Copy, HandCoins, Share2, TriangleAlert, Waypoints, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, Share, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { arcIdentity } from "@kawase/identity";
import { Amount } from "@kawase/ui-native/components/amount";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { DottedQr } from "@kawase/ui-native/components/dotted-qr";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { NetworkChip, TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Sheet, SheetInput } from "@kawase/ui-native/components/sheet";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { tokens } from "@kawase/ui-tokens";

import { MainnetConsentSheet } from "@/components/network-pill";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { AssetPickerSheet } from "@/portfolio/asset-picker-sheet";
import { tokenAmount } from "@/portfolio/format";
import { stableToken, unitsFromCanonical, type TicketToken } from "@/portfolio/ticket-token";
import { transferUri } from "@/receive/request-uri";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const QR_MARGIN = 40;
const QR_MAX = 300;
const QR_PADDING = 20;
const CENTER_MARK = 44;
const CENTER_PADDING = 6;
const FOOTER_GAP = 16;
const HALF = 0.5;
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const ROW_MARK = 32;
const ART_WIDTH = 160;
const ZERO = 0n;

const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

type Ask = { token: TicketToken; units: bigint };

/** `prefill`: a token page's Receive starts the request on that token. */
export function ReceiveScreen({ prefill }: { prefill?: TicketToken | undefined } = {}) {
  const { locale } = useLocale();
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const colors = useThemeColors();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { wallet } = useWalletStatus();
  const { network, switchNetwork, busy, consentNeeded, acceptMainnet, dismissConsent } = useNetworkSwitch();
  const [chooserOpen, setChooserOpen] = React.useState(false);
  // The request: none (the bare address), or a token and an amount; the sheet edits a draft of it.
  const [ask, setAsk] = React.useState<Ask | null>(null);
  const [askOpen, setAskOpen] = React.useState(Boolean(prefill));
  const [askToken, setAskToken] = React.useState<TicketToken | undefined>(prefill);
  const [askText, setAskText] = React.useState("");
  const [picking, setPicking] = React.useState(false);

  const testnet = network === "testnet";
  const ids = arcIdentity(network);
  const networkLabel = testnet ? t("network.arcTestnet") : t("network.arc");
  const address = wallet?.address;
  const account = status === "account";
  const qrSize = Math.min(QR_MAX, width - (QR_MARGIN + QR_PADDING) / HALF);
  // The code sits on an ink tile so it scans on both themes.
  const ink = tokens.themes.dark;

  const chainId = stableToken(network, "USDC").chainId;
  // A request made on the other network no longer matches the code's chain: it goes back to the bare address.
  const asking = ask && ask.token.chainId === chainId ? ask : null;
  const askLabel = asking ? tokenAmount(asking.units.toString(), asking.token.decimals, asking.token.symbol, locale) : "";
  const uri = asking && address ? transferUri(asking.token.address, chainId, address, asking.units) : null;
  const draftToken = askToken && askToken.chainId === chainId ? askToken : stableToken(network, "USDC");
  const draftUnits = unitsFromCanonical(askText.trim().replace(",", "."), draftToken.decimals);

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(uri ?? address);
    toast(t("home.addressCopied"));
  };
  const share = async () => {
    if (!address) return;
    await Share.share({
      message: uri ? t("receive.shareAsk", { amount: askLabel, network: networkLabel, address, uri }) : t("receive.shareMessage", { network: networkLabel, address }),
    });
  };
  const showAsk = () => {
    if (draftUnits === undefined || draftUnits === ZERO) return;
    setAsk({ token: draftToken, units: draftUnits });
    setAskOpen(false);
  };

  const header = (
    <>
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text className="font-display text-foreground text-2xl font-bold">{t("receive.title")}</Text>
      </View>
    </>
  );

  if (!address) {
    return (
      <View className="bg-background flex-1">
        {header}
        <View className="flex-1" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <EmptyState
            art={<Koban width={ART_WIDTH} />}
            title={account ? t("receive.setUpFirst") : t("receive.noWallet")}
            body={account ? t("receive.setUpFirstBody") : t("receive.noWalletBody")}
            action={
              <Button onPress={() => (account ? router.push("/wallet") : signIn.open())}>
                <Text>{account ? t("wallet.setUp") : t("signIn.title")}</Text>
              </Button>
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View className="bg-background flex-1">
      {header}
      <View className="flex-1 items-center justify-center gap-6 px-5">
        <View className="items-center justify-center rounded-lg" style={{ padding: QR_PADDING, backgroundColor: ink.background }}>
          <DottedQr
            value={uri ?? address}
            size={qrSize}
            dotColor={ink.foreground}
            background={ink.background}
            center={
              <View className="items-center justify-center rounded-2xl" style={{ backgroundColor: ink.background, padding: CENTER_PADDING }}>
                <Mark entity={ids.chain} size={CENTER_MARK} />
              </View>
            }
          />
        </View>

        <View className="w-full gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("receive.network")}
            onPress={() => setChooserOpen(true)}
            className="bg-card border-border active:bg-muted flex-row items-center gap-3 rounded-full border py-3 pe-4 ps-3"
          >
            <Mark entity={ids.chain} size={ROW_MARK} />
            <View className="min-w-0 flex-1 flex-row items-center gap-2">
              {user?.handle ? (
                <Text numberOfLines={1} className="text-foreground shrink text-base font-semibold">
                  @{user.handle}
                </Text>
              ) : null}
              <Amount className={user?.handle ? "text-muted-foreground text-sm" : "text-foreground text-base"}>{shortAddress(address)}</Amount>
            </View>
            <NetworkChip label={networkLabel} />
            <Icon as={ChevronDown} className="text-muted-foreground size-4" />
          </Pressable>
          {asking ? (
            <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border py-2 pe-2 ps-3">
              <TokenMark token={asking.token} size={ROW_MARK} />
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-base font-semibold">{askLabel}</Text>
                <Text className="text-muted-foreground text-xs">{t("receive.askHint", { amount: askLabel, network: networkLabel })}</Text>
              </View>
              <Button variant="ghost" size="icon" className="size-10" accessibilityLabel={t("receive.askClear")} onPress={() => setAsk(null)}>
                <Icon as={X} className="size-5" />
              </Button>
            </View>
          ) : (
            <>
              <View className="bg-network-surface flex-row items-start gap-2 rounded-2xl px-4 py-3">
                <Icon as={TriangleAlert} className="text-network mt-0.5 size-4" />
                <Text className="text-network flex-1 text-sm">{t("receive.anyToken")}</Text>
              </View>
              <Button variant="ghost" onPress={() => setAskOpen(true)}>
                <Icon as={HandCoins} className="size-5" />
                <Text>{t("receive.askAmount")}</Text>
              </Button>
            </>
          )}
        </View>
      </View>

      <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <Button size="lg" onPress={() => void copy()}>
          <Icon as={Copy} className="text-primary-foreground size-5" />
          <Text>{t("receive.copy")}</Text>
        </Button>
        <Button size="lg" variant="secondary" onPress={() => void share()}>
          <Icon as={Share2} className="size-5" />
          <Text>{t("receive.share")}</Text>
        </Button>
      </View>

      <Sheet open={chooserOpen} onClose={() => setChooserOpen(false)} title={t("network.chooseNetwork")} colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }} closeLabel={t("common.close")} bottomInset={insets.bottom}>
        <ListGroup>
          {(["testnet", "mainnet"] as const).map((id) => (
            <ListRow
              key={id}
              leading={<Mark entity={arcIdentity(id).chain} size={ROW_MARK} />}
              title={id === "testnet" ? t("network.arcTestnet") : t("network.arc")}
              subtitle={id === "testnet" ? t("network.testnetStrip") : t("network.realMoney")}
              selected={id === network}
              disabled={busy}
              accessibilityRole="radio"
              onPress={() => {
                setChooserOpen(false);
                void switchNetwork(id);
              }}
            />
          ))}
        </ListGroup>
        {/* The same address on the other chains (surfaces.md Receive: "a chain chooser … other chains get Bring to Arc"). */}
        <ListGroup label={t("assets.otherChainsTotal")}>
          <ListRow
            leading={<Icon as={Waypoints} className="text-muted-foreground size-5" />}
            title={t("receive.otherChains")}
            subtitle={t("receive.otherChainsBody")}
            chevron
            onPress={() => {
              setChooserOpen(false);
              router.push({ pathname: "/move", params: { direction: "in" } });
            }}
          />
        </ListGroup>
      </Sheet>
      <MainnetConsentSheet open={consentNeeded} busy={busy} onAccept={() => void acceptMainnet()} onClose={dismissConsent} />
      <Sheet open={askOpen} onClose={() => setAskOpen(false)} title={t("receive.askAmount")} colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }} closeLabel={t("common.close")} bottomInset={insets.bottom}>
        <View className="gap-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("receive.askAsset")}: ${draftToken.symbol}`}
            onPress={() => setPicking(true)}
            className="bg-muted active:bg-secondary flex-row items-center gap-3 rounded-2xl px-4 py-3"
          >
            <TokenMark token={draftToken} size={ROW_MARK} />
            <Text className="text-foreground flex-1 text-base font-semibold">{draftToken.symbol}</Text>
            <Icon as={ChevronDown} className="text-muted-foreground size-4" />
          </Pressable>
          <SheetInput
            value={askText}
            onChangeText={setAskText}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0"
            accessibilityLabel={t("receive.askAmount")}
            onSubmitEditing={showAsk}
          />
          <Button disabled={draftUnits === undefined || draftUnits === ZERO} onPress={showAsk}>
            <Text>{t("receive.askShow")}</Text>
          </Button>
        </View>
      </Sheet>
      <AssetPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        title={t("receive.askAsset")}
        mode="any"
        selected={draftToken.address.toLowerCase()}
        onSelect={(choice) => {
          setAskToken(choice.token);
          setPicking(false);
        }}
      />
    </View>
  );
}
