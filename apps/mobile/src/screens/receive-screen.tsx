// Receive on the Senryo kit (journey 8, C32 / M04 / S21 / P21; 21st.dev designali-in/qr-code #1706 as the spec): the
// dotted QR with the Arc mark at its centre on a plate that stays light in both themes (it scans), the identity row
// (name · short address · network) whose chevron opens the network sheet, the "any token on Arc" line, Copy and Share.
// The QR always encodes the live wallet address, never a fixture, and stays left-to-right in every language. Without a
// wallet the page says what to do instead of showing a fake code. "Ask for an amount" turns the code into a request:
// any token on Arc and an amount (the kit's pad), as an EIP-681 transfer URI any wallet fills in (gaps.md G10); a token
// page's Receive starts it on that token. Other chains: the same address works there, then Bring to Arc.
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { arcIdentity } from "@kawase/identity";
import { DottedQr } from "@kawase/ui-native/components/dotted-qr";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { AmountPad, Button, diagnose, EmptyState, ErrorState, Skeleton } from "@/components/kit";
import { Check, ChevronDown, ChevronLeft, Icon, X } from "@/components/kit/icons";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { SheetRow } from "@/components/sheet/SheetRow";
import { notify } from "@/components/toast/notify";
import { MainnetConsentSheet } from "@/components/network-pill";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { AssetPickerSheet } from "@/portfolio/asset-picker-sheet";
import { tokenAmount } from "@/portfolio/format";
import { stableToken, type TicketToken } from "@/portfolio/ticket-token";
import { transferUri } from "@/receive/request-uri";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const QR_MAX = 280;
const SIDES = 2;
const QR_GUTTER = (SPACE.inset + SPACE.xl) * SIDES;
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const ZERO = 0n;
const TOKEN_FRACTION = 6;

const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

type Ask = { token: TicketToken; units: bigint };

/** `prefill`: a token page's Receive starts the request on that token. */
export function ReceiveScreen({ prefill }: { prefill?: TicketToken | undefined } = {}) {
  const { locale } = useLocale();
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { wallet, known, error, refresh } = useWalletStatus();
  const { network, switchNetwork, busy, consentNeeded, acceptMainnet, dismissConsent } = useNetworkSwitch();
  const [chooserOpen, setChooserOpen] = React.useState(false);
  // The request: none (the bare address), or a token and an amount; the sheet edits a draft of it.
  const [ask, setAsk] = React.useState<Ask | null>(null);
  const [askOpen, setAskOpen] = React.useState(Boolean(prefill));
  const [askToken, setAskToken] = React.useState<TicketToken | undefined>(prefill);
  const [draftUnits, setDraftUnits] = React.useState<bigint>(ZERO);
  const [picking, setPicking] = React.useState(false);

  const testnet = network === "testnet";
  const ids = arcIdentity(network);
  const networkLabel = testnet ? t("network.arcTestnet") : t("network.arc");
  const address = wallet?.address;
  const account = status === "account";
  const qrSize = Math.min(QR_MAX, width - QR_GUTTER);

  const chainId = stableToken(network, "USDC").chainId;
  // A request made on the other network no longer matches the code's chain: it goes back to the bare address.
  const asking = ask && ask.token.chainId === chainId ? ask : null;
  const askLabel = asking ? tokenAmount(asking.units.toString(), asking.token.decimals, asking.token.symbol, locale) : "";
  const uri = asking && address ? transferUri(asking.token.address, chainId, address, asking.units) : null;
  const draftToken = askToken && askToken.chainId === chainId ? askToken : stableToken(network, "USDC");

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(uri ?? address);
    notify.success(t("home.addressCopied"));
  };
  const share = async () => {
    if (!address) return;
    fire("press");
    await Share.share({
      message: uri ? t("receive.shareAsk", { amount: askLabel, network: networkLabel, address, uri }) : t("receive.shareMessage", { network: networkLabel, address }),
    });
  };
  const showAsk = () => {
    if (draftUnits === ZERO) return;
    setAsk({ token: draftToken, units: draftUnits });
    setAskOpen(false);
    fire("confirm");
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + SPACE.md }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("receive.back")}
        hitSlop={SPACE.sm}
        onPress={() => {
          fire("tick");
          if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
        style={({ pressed }) => [styles.round, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
      >
        <Icon icon={ChevronLeft} size={SIZE.iconSm} tint={color.ink} />
      </Pressable>
      <Text accessibilityRole="header" style={[TYPE.pageTitle, { color: color.ink }]}>
        {t("receive.title")}
      </Text>
    </View>
  );

  // Still reading the wallet: the page's own shape (the code, the address plate), never "set up your wallet" first.
  if (!address && account && !known) {
    return (
      <View style={[styles.fill, { backgroundColor: color.background }]}>
        {header}
        <View style={[styles.fill, styles.center, styles.pad, styles.loading]}>
          <Skeleton width={qrSize + SPACE.xl * SIDES} height={qrSize + SPACE.xl * SIDES} radius={RADIUS.lg} />
          <Skeleton width={qrSize} height={SIZE.touch} radius={RADIUS.pill} />
        </View>
      </View>
    );
  }
  if (!address && account && error) {
    return (
      <View style={[styles.fill, { backgroundColor: color.background }]}>
        {header}
        <View style={[styles.fill, styles.pad]}>
          <ErrorState diagnosis={diagnose(new Error("wallet status"))} retry={() => void refresh()} />
        </View>
      </View>
    );
  }
  if (!address) {
    return (
      <View style={[styles.fill, { backgroundColor: color.background }]}>
        {header}
        <View style={[styles.fill, styles.pad]}>
          <EmptyState
            why={account ? t("receive.setUpFirst") : t("receive.noWallet")}
            detail={account ? t("receive.setUpFirstBody") : t("receive.noWalletBody")}
            action={{ label: account ? t("receive.setUp") : t("receive.signIn"), onPress: () => (account ? router.push("/wallet") : signIn.open()) }}
            size="page"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: color.background }]}>
      {header}
      <View style={[styles.fill, styles.center, styles.pad]}>
        <View style={[styles.qr, { backgroundColor: color.paper }]} accessible accessibilityLabel={uri ? t("receive.qrAsk", { amount: askLabel }) : t("receive.qrAddress")}>
          <DottedQr
            value={uri ?? address}
            size={qrSize}
            dotColor={color.paperInk}
            background={color.paper}
            center={
              <View style={[styles.qrCenter, { backgroundColor: color.paper }]}>
                <Mark entity={ids.chain} size={SIZE.markDetail} />
              </View>
            }
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("receive.network")}
          onPress={() => {
            fire("tick");
            setChooserOpen(true);
          }}
          style={({ pressed }) => [styles.identity, { backgroundColor: pressed ? color.rowPressed : color.card }]}
        >
          <Mark entity={ids.chain} size={SIZE.markToken} />
          <View style={styles.grow}>
            {user?.handle ? <Text numberOfLines={1} style={[TYPE.rowTitle, { color: color.ink }]}>{`@${user.handle}`}</Text> : null}
            <Text style={[TYPE.rowDetail, styles.mono, { color: user?.handle ? color.text3 : color.ink }]}>{shortAddress(address)}</Text>
          </View>
          <View style={[styles.capsule, { backgroundColor: color.networkSurface }]}>
            <Text style={[TYPE.chipLabel, { color: color.network }]}>{networkLabel}</Text>
          </View>
          <Icon icon={ChevronDown} size={SIZE.iconSm} tint={color.text3} />
        </Pressable>

        {asking ? (
          <View style={[styles.identity, { backgroundColor: color.card }]}>
            <TokenMark token={asking.token} size={SIZE.markToken} />
            <View style={styles.grow}>
              <Text style={[TYPE.rowTitle, { color: color.ink }]}>{askLabel}</Text>
              <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("receive.askHint", { amount: askLabel, network: networkLabel })}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t("receive.askClear")} hitSlop={SPACE.sm} onPress={() => setAsk(null)} style={({ pressed }) => [styles.round, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}>
              <Icon icon={X} size={SIZE.iconSm} tint={color.ink} />
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[TYPE.rowDetail, styles.centerText, { color: color.text2 }]}>{t("receive.anyToken")}</Text>
            <Button label={t("receive.askAmount")} variant="ghost" block={false} onPress={() => setAskOpen(true)} />
          </>
        )}
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + SPACE.lg }]}>
        <Button label={t("receive.copy")} onPress={() => void copy()} />
        <Button label={t("receive.share")} variant="secondary" onPress={() => void share()} />
      </View>

      {chooserOpen ? (
        <Sheet onClose={() => setChooserOpen(false)} closeLabel={t("receive.closeNetwork")}>
          <SheetHeading title={t("network.chooseNetwork")} />
          {(["testnet", "mainnet"] as const).map((id, index) => (
            <SheetRow
              key={id}
              index={index}
              title={id === "testnet" ? t("network.arcTestnet") : t("network.arc")}
              detail={id === "testnet" ? t("network.testnetStrip") : t("network.realMoney")}
              leading={<Mark entity={arcIdentity(id).chain} size={SIZE.markToken} />}
              trailing={id === network ? <Icon icon={Check} size={SIZE.icon} tint={color.ink} /> : undefined}
              selected={id === network}
              disabled={busy}
              onPress={() => {
                setChooserOpen(false);
                void switchNetwork(id);
              }}
            />
          ))}
          {/* The same address on the other chains (surfaces.md Receive: "a chain chooser … other chains get Bring to Arc"). */}
          <SheetRow
            index={2}
            title={t("receive.otherChains")}
            detail={t("receive.otherChainsBody")}
            onPress={() => {
              setChooserOpen(false);
              router.push({ pathname: "/move", params: { direction: "in" } });
            }}
          />
        </Sheet>
      ) : null}
      <MainnetConsentSheet open={consentNeeded} busy={busy} onAccept={() => void acceptMainnet()} onClose={dismissConsent} />
      {askOpen ? (
        <Sheet onClose={() => setAskOpen(false)} closeLabel={t("receive.closeAsk")}>
          <SheetHeading title={t("receive.askAmount")} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("receive.askAsset")}: ${draftToken.symbol}`}
            onPress={() => {
              fire("tick");
              setPicking(true);
            }}
            style={({ pressed }) => [styles.identity, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
          >
            <TokenMark token={draftToken} size={SIZE.markToken} />
            <Text style={[TYPE.rowTitle, styles.grow, { color: color.ink }]}>{draftToken.symbol}</Text>
            <Icon icon={ChevronDown} size={SIZE.iconSm} tint={color.text3} />
          </Pressable>
          <AmountPad value={draftUnits} onChange={setDraftUnits} decimals={draftToken.decimals} fraction={Math.min(TOKEN_FRACTION, draftToken.decimals)} prefix="" suffix={draftToken.symbol} label={t("receive.askAmount")} />
          <Button label={t("receive.askShow")} disabled={draftUnits === ZERO} onPress={showAsk} />
        </Sheet>
      ) : null}
      <AssetPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        title={t("receive.askAsset")}
        mode="any"
        selected={draftToken.address.toLowerCase()}
        onSelect={(choice) => {
          setAskToken(choice.token);
          setDraftUnits(ZERO);
          setPicking(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, gap: SPACE.xxs },
  pad: { paddingHorizontal: SPACE.inset },
  center: { alignItems: "center", justifyContent: "center", gap: SPACE.lg },
  centerText: { textAlign: "center" },
  mono: { fontVariant: ["tabular-nums"] },
  header: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.inset, paddingBottom: SPACE.sm },
  round: { width: SIZE.touch - SPACE.sm, height: SIZE.touch - SPACE.sm, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  qr: { padding: SPACE.xl, borderRadius: RADIUS.lg },
  loading: { gap: SPACE.lg },
  qrCenter: { padding: SPACE.xs, borderRadius: RADIUS.md },
  identity: { flexDirection: "row", alignItems: "center", gap: SPACE.md, alignSelf: "stretch", paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg, borderRadius: RADIUS.md },
  capsule: { height: SIZE.chipHeight, paddingHorizontal: SPACE.md, borderRadius: RADIUS.pill, justifyContent: "center" },
  actions: { gap: SPACE.sm, paddingHorizontal: SPACE.inset },
});
