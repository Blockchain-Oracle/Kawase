// Send any asset (journey 10; R1; C1, C5, C7, I5, N5): who → which token and how much → review → sending → the ending. The steps cross-fade in
// place under one header. Review shows exactly what will move (SendReview) and, when something stops it, the one
// fix next to it (SendBlocker); the one lime button names the route — "Send" inside the allowance (the tap is the
// approval), "Send with Face ID" above it — or, when blocked, the first fixable reason. Going back to change the
// amount or the recipient makes a new version of the same send instead of a second one. Once it moves, the plane
// and the money ending take over (SendStatus), with "Save as contact" after a send to a raw address.
import { useRouter } from "expo-router";
import { ChevronLeft, ScanFace, Send } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { SendRequest } from "@kawase/api-client";
import { CHAIN_IDS } from "@kawase/identity";
import { MOTION } from "@kawase/config";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { AssetPickerSheet } from "@/portfolio/asset-picker-sheet";
import { assetParam, stableToken, unitsFromCanonical, type TicketToken } from "@/portfolio/ticket-token";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";

import { AmountStep } from "@/send/amount-step";
import { recipientName, useMoney, useApproveLabel, usePolicyText } from "@/send/copy";
import { choiceFromText, RecipientStep, type RecipientChoice } from "@/send/recipient-step";
import { SendBlocker } from "@/send/send-blocker";
import { SendReview } from "@/send/send-review";
import { SendStatus } from "@/send/send-status";
import { isFinished, isMoving, isOpen, useSend } from "@/send/use-send";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 12;
const ART_WIDTH = 170;
const ZERO = 0n;

type Step = "recipient" | "amount" | "review";

export type SendPrefill = {
  to?: string | undefined;
  amount?: string | undefined;
  /** "USDC", "EURC" or any token's address on the active network. */
  asset?: string | undefined;
  /** Paying a payment request: its link token, carried into the send so the request is marked paid by it. */
  requestToken?: string | undefined;
};

export function SendScreen({ prefill }: { prefill: SendPrefill }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { wallet } = useWalletStatus();
  const controller = useSend();
  const money = useMoney();
  const policyText = usePolicyText();
  const approveLabel = useApproveLabel();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";

  const [step, setStep] = React.useState<Step>(prefill.to ? "amount" : "recipient");
  const [recipient, setRecipient] = React.useState<RecipientChoice | undefined>(prefill.to ? choiceFromText(prefill.to) : undefined);
  const [picked, setPicked] = React.useState<TicketToken | undefined>(
    prefill.asset === "USDC" || prefill.asset === "EURC" ? stableToken(network, prefill.asset) : undefined,
  );
  const [picking, setPicking] = React.useState(false);
  const { portfolio } = usePortfolio();
  const fund = useFund();
  const [value, setValue] = React.useState(prefill.amount ?? "");
  const [note, setNote] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const state = wallet?.networks[network];
  const usdcHeld = state ? BigInt(state.usdcBalance) : undefined;
  const eurcHeld = state ? BigInt(state.eurcBalance ?? "0") : undefined;
  // Until the person picks, the asset is the stablecoin they hold (USDC when they hold both or neither).
  const token: TicketToken = picked ?? stableToken(network, usdcHeld === ZERO && (eurcHeld ?? ZERO) > ZERO ? "EURC" : "USDC");
  const holding = portfolio?.assets.find((entry) => entry.token.address.toLowerCase() === token.address.toLowerCase());
  const balance = holding ? BigInt(holding.balance) : token.symbol === "USDC" ? usdcHeld : token.symbol === "EURC" ? eurcHeld : portfolio ? ZERO : undefined;

  // A link or a token page names any token by address: describe it once.
  React.useEffect(() => {
    const asked = prefill.asset;
    if (!asked || !/^0x[0-9a-fA-F]{40}$/.test(asked)) return undefined;
    let live = true;
    api.tokens
      .get(network === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet, asked)
      .then(({ token: detail }) => {
        if (live) setPicked(detail.token);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [prefill.asset, network]);

  const intent = controller.intent;
  const settled = intent && (isMoving(intent) || isFinished(intent));
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const back = () => {
    if (settled || step === "recipient") leave();
    else setStep(step === "review" ? "amount" : "recipient");
  };

  // Review: the same send gets a new version when the person comes back with a change; a closed one starts over.
  const review = async () => {
    if (!recipient) return;
    const request: SendRequest = {
      recipient: recipient.text,
      amount: value,
      asset: assetParam(token),
      note: note.trim() || null,
      requestToken: prefill.requestToken ?? null,
    };
    setCreating(true);
    try {
      if (intent && isOpen(intent)) {
        const next = await controller.revise(request);
        if (next) setStep("review");
      } else {
        const { intent: fresh } = await api.sends.create(request);
        controller.set(fresh);
        setStep("review");
      }
    } catch {
      // The controller's revise reports its own errors; a failed create says so here.
      toast(t("send.failed"));
    } finally {
      setCreating(false);
    }
  };

  const cancel = async () => {
    await controller.cancel();
    leave();
  };

  // The recipient's wallet is on another chain (money-out.md "From → To"): USDC goes by a bridge with route options
  // (the Move screen, same amount and recipient); any other token converts to USDC first.
  const isUsdc = token.address.toLowerCase() === stableToken(network, "USDC").address.toLowerCase();
  const otherChain = async () => {
    if (!recipient) return;
    if (intent && isOpen(intent)) await controller.cancel();
    if (isUsdc)
      router.push({ pathname: "/move", params: { direction: "out", amount: value, recipient: recipient.text } });
    else router.push({ pathname: "/swap", params: { sell: token.address } });
  };

  const header = (
    <>
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={back}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text className="font-display text-foreground text-2xl font-bold">{t("send.title")}</Text>
      </View>
    </>
  );

  // Without an account or a wallet there is nothing to send from; say what to do instead.
  const blockedPage =
    status !== "account"
      ? { title: t("policy.SIGN_IN_REQUIRED"), action: t("policy.fixSignIn"), onPress: () => signIn.open() }
      : wallet && !wallet.address
        ? { title: t("policy.WALLET_NOT_READY"), action: t("policy.fixSetUp"), onPress: () => router.push("/wallet") }
        : undefined;
  if (blockedPage) {
    return (
      <View className="bg-background flex-1">
        {header}
        <View className="flex-1" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <EmptyState
            art={<PaperPlane width={ART_WIDTH} id="send-blocked-plane" />}
            title={blockedPage.title}
            action={
              <Button onPress={blockedPage.onPress}>
                <Text>{blockedPage.action}</Text>
              </Button>
            }
          />
        </View>
      </View>
    );
  }

  const enter = reduced ? undefined : FadeIn.duration(MOTION.sheetMs);
  const exit = reduced ? undefined : FadeOut.duration(MOTION.sheetMs);
  const visible: Step | "status" = settled ? "status" : step;

  let body: React.ReactNode;
  if (visible === "status" && intent) {
    const saveable = intent.outcome === "sent" && intent.draft?.recipient.via === "address";
    body = (
      <ScrollView className="flex-1" contentContainerClassName="flex-grow justify-center px-5" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <SendStatus
          connectionLost={controller.connectionLost}
          intent={intent}
          actions={
            isFinished(intent) ? (
              <>
                <Button size="lg" onPress={leave}>
                  <Text>{t("send.done")}</Text>
                </Button>
                {saveable ? (
                  <Button size="lg" variant="secondary" onPress={() => setSaving(true)}>
                    <Text>{t("send.saveContact")}</Text>
                  </Button>
                ) : null}
              </>
            ) : null
          }
        />
      </ScrollView>
    );
  } else if (visible === "review" && intent) {
    const draft = intent.draft;
    const blocking = intent.blocking;
    const name = recipientName(draft?.recipient, intent.request.recipient);
    const prompt = t("send.signPrompt", { amount: money(draft?.asset, draft?.amount, draft?.token?.decimals), name });
    const faceId = intent.route === "wallet_signature";
    body = (
      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pt-4 pb-4">
          {!testnet ? <Eyebrow className="text-foreground">{t("network.realMoney")}</Eyebrow> : null}
          <SendReview intent={intent} />
          {blocking ? <SendBlocker controller={controller} onEditAmount={() => setStep("amount")} /> : null}
          {!blocking && draft ? (
            <Pressable accessibilityRole="button" onPress={() => void otherChain()} className="active:bg-muted gap-0.5 rounded-2xl px-1 py-2">
              <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t("send.otherChain")}</Text>
              <Text className={cn("text-muted-foreground text-xs leading-4", TEXT_START)}>{isUsdc ? t("send.otherChainBridge") : t("send.otherChainConvert", { asset: token.symbol })}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        <View className="gap-2 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <Button size="lg" disabled={Boolean(blocking) || controller.busy} onPress={() => void controller.approve(prompt)}>
            {blocking ? null : <Icon as={faceId ? ScanFace : Send} className="text-primary-foreground size-5" />}
            <Text numberOfLines={2} className="text-center">
              {blocking ? policyText(blocking, intent.network) : controller.busy ? t("send.sending") : faceId ? approveLabel : t("send.sendNow")}
            </Text>
          </Button>
          <Button variant="ghost" disabled={controller.busy} onPress={() => void cancel()}>
            <Text className="text-muted-foreground">{t("send.cancelSend")}</Text>
          </Button>
        </View>
      </View>
    );
  } else if (visible === "amount" && recipient) {
    body = (
      <AmountStep
        network={network}
        recipient={recipient}
        onChangeRecipient={() => setStep("recipient")}
        token={token}
        onPickAsset={() => setPicking(true)}
        value={value}
        onValue={setValue}
        note={note}
        onNote={setNote}
        balance={balance}
        onReview={() => void review()}
        busy={creating || controller.busy}
      />
    );
  } else {
    body = (
      <RecipientStep
        onPick={(choice) => {
          setRecipient(choice);
          setStep("amount");
        }}
      />
    );
  }

  return (
    <View className="bg-background flex-1">
      {header}
      <Animated.View key={visible} entering={enter} exiting={exit} className="flex-1">
        {body}
      </Animated.View>
      <AssetPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        title={t("assets.pickerTitle")}
        mode="held"
        selected={token.address.toLowerCase()}
        onSelect={({ token: next }) => {
          setPicked(next);
          // A value with more decimals than the new token allows would not parse.
          if (value && unitsFromCanonical(value, next.decimals) === undefined) setValue("");
        }}
        unavailable={(candidate) => (candidate.kind === "permissioned" ? t("tokenPage.n_permissioned") : undefined)}
        onAddMoney={fund.open}
      />
      {intent?.draft ? (
        <AddContactSheet
          open={saving}
          onClose={() => setSaving(false)}
          initialAddress={intent.draft.recipient.address}
          initialSource="pasted"
          onSaved={() => setSaving(false)}
        />
      ) : null}
    </View>
  );
}
