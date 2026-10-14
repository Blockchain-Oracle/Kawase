// Send any asset (journey 10; R1; C1, C5, C7, I5, N5), on the Senryo kit: who → which token and how much → review →
// sending → the ending. Review shows exactly what will move (SendReview) and, when something stops it, the one fix
// (SendBlocker). Otherwise the tx kit's CTA names the route, "Send" inside the allowance (the tap is the approval) or
// "Send with Face ID" above it, runs Signing → Sent → Confirmed under the plate, and morphs into the receipt (with
// "Save as contact" after a send to a raw address); a failure card says whether money moved. Going back to change the
// amount or the recipient makes a new version of the same send instead of a second one.
// Phone: the steps crossfade under one header. Desktop: two columns, the people on the stage (search, contacts,
// handles, a pasted address) and the ticket beside them (amount, review, the lifecycle), so changing who is one click.
import { useRouter } from "expo-router";
import { UserPlus } from "lucide-react-native";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { toast } from "sonner-native";

import type { SendRequest } from "@kawase/api-client";
import { CHAIN_IDS } from "@kawase/identity";
import { useWide } from "@kawase/ui-native/lib/wide";

import { Button, EmptyState, KeyValue, ListRow, Panel, SPACE, TIMING, TYPE, useTheme } from "@/components/kit";
import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { AssetPickerSheet } from "@/portfolio/asset-picker-sheet";
import { assetParam, stableToken, unitsFromCanonical, type TicketToken } from "@/portfolio/ticket-token";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { AmountStep } from "@/send/amount-step";
import { recipientName, useApproveLabel, useMoney } from "@/send/copy";
import { choiceFromText, RecipientStep, type RecipientChoice } from "@/send/recipient-step";
import { SendBlocker } from "@/send/send-blocker";
import { SendReview } from "@/send/send-review";
import { isFinished, isMoving, isOpen, useSend } from "@/send/use-send";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { RealMoney } from "@/trade/bits";
import { IntentCta, openExplorer } from "@/trade/intent-cta";
import { Columns, PageHeader, PhoneScroll } from "@/trade/page-frame";
import { useFeeReserve } from "@/wallet/fee-reserve";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const ZERO = 0n;

type Step = "recipient" | "amount" | "review";

export type SendPrefill = {
  to?: string | undefined;
  amount?: string | undefined;
  /** "USDC", "EURC" or any token's address on the active network. */
  asset?: string | undefined;
  /** Paying a payment request: its link token, carried into the send so the request is marked paid by it. */
  requestToken?: string | undefined;
  /** A reference a scanned code carries, written on chain with the payment (Arc Memo). */
  memo?: string | undefined;
  memoId?: string | undefined;
};

export function SendScreen({ prefill }: { prefill: SendPrefill }) {
  const feeReserve = useFeeReserve();
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const wide = useWide();
  const reduced = useReducedMotion();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { wallet } = useWalletStatus();
  const controller = useSend();
  const money = useMoney();
  const approveLabel = useApproveLabel();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";

  const [step, setStep] = React.useState<Step>(prefill.to ? "amount" : "recipient");
  const [recipient, setRecipient] = React.useState<RecipientChoice | undefined>(prefill.to ? choiceFromText(prefill.to) : undefined);
  const [picked, setPicked] = React.useState<TicketToken | undefined>(prefill.asset === "USDC" || prefill.asset === "EURC" ? stableToken(network, prefill.asset) : undefined);
  const [picking, setPicking] = React.useState(false);
  const { portfolio } = usePortfolio();
  const fund = useFund();
  const [value, setValue] = React.useState(prefill.amount ?? "");
  const [note, setNote] = React.useState("");
  const [reference, setReference] = React.useState(prefill.memo ?? "");
  // A bytes32 id from the code stays with its text; once the text is removed or changed, it no longer applies.
  const codeMemoId = prefill.memoId && reference === (prefill.memo ?? "") ? prefill.memoId : undefined;
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

  // A send the person is done with (Done, or Cancel on a desktop window) leaves the ticket; the next review drafts anew.
  const [dismissed, setDismissed] = React.useState<string>();
  const intent = controller.intent && controller.intent.id !== dismissed ? controller.intent : undefined;
  const settled = intent && (isMoving(intent) || isFinished(intent));
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const back = () => {
    if (wide || settled || step === "recipient") leave();
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
      memo: reference.trim() || null,
      memoId: codeMemoId ?? null,
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

  const startOver = () => {
    setDismissed(controller.intent?.id);
    setValue("");
    setStep(wide ? "amount" : "recipient");
  };

  // The recipient's wallet is on another chain (money-out.md "From → To"): the Move screen (same amount and recipient)
  // with its route options; on testnet any other token converts to USDC first.
  const isUsdc = token.address.toLowerCase() === stableToken(network, "USDC").address.toLowerCase();
  const asItself = isUsdc || !testnet;
  const otherChain = async () => {
    if (!recipient) return;
    if (intent && isOpen(intent)) await controller.cancel();
    if (asItself) router.push({ pathname: "/move", params: { direction: "out", amount: value, recipient: recipient.text, ...(isUsdc ? {} : { asset: token.address }) } });
    else router.push({ pathname: "/swap", params: { sell: token.address } });
  };

  const header = <PageHeader title={t("send.title")} onBack={back} />;

  // Without an account or a wallet there is nothing to send from; say what to do instead.
  const blockedPage =
    status !== "account"
      ? { title: t("policy.SIGN_IN_REQUIRED"), action: t("policy.fixSignIn"), onPress: () => signIn.open() }
      : wallet && !wallet.address
        ? { title: t("policy.WALLET_NOT_READY"), action: t("policy.fixSetUp"), onPress: () => router.push("/wallet") }
        : undefined;
  if (blockedPage) {
    return (
      <View style={styles.page}>
        {header}
        <View style={styles.plain}>
          <EmptyState size="page" icon={UserPlus} why={blockedPage.title} action={{ label: blockedPage.action, onPress: blockedPage.onPress }} />
        </View>
      </View>
    );
  }

  const pickRecipient = (choice: RecipientChoice) => {
    // A new person on an open draft: the next review revises it (a new version), never a second send.
    setRecipient(choice);
    setStep("amount");
  };

  let ticket: React.ReactNode = null;
  if ((step === "review" || settled) && intent) {
    const draft = intent.draft;
    const name = recipientName(draft?.recipient, intent.request.recipient);
    const what = t("send.signPrompt", { amount: money(draft?.asset, draft?.amount, draft?.token?.decimals), name });
    const faceId = intent.route === "wallet_signature";
    const saveable = intent.outcome === "sent" && draft?.recipient.via === "address";
    const receipt = (
      <Panel style={styles.receipt}>
        <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{t("send.sentTitle")}</Text>
        {draft ? <KeyValue label={name} value={money(draft.asset, draft.amount, draft.token?.decimals)} /> : null}
        <Button label={t("send.done")} onPress={wide ? startOver : leave} />
        {saveable ? <Button label={t("send.saveContact")} variant="secondary" onPress={() => setSaving(true)} /> : null}
        {intent.tx ? <Button label={t("desktop.explorer")} variant="ghost" onPress={() => openExplorer(intent.tx?.explorerUrl)} /> : null}
      </Panel>
    );
    ticket = (
      <View style={styles.group}>
        {!testnet && !isFinished(intent) ? <RealMoney /> : null}
        <SendReview intent={intent} onRevise={(patch) => void controller.revise(patch)} />
        {intent.blocking && isOpen(intent) ? (
          <SendBlocker controller={controller} onEditAmount={() => setStep("amount")} />
        ) : (
          <IntentCta
            intent={intent}
            busy={controller.busy}
            connectionLost={controller.connectionLost}
            blocker={!draft ? { label: t("desktop.pricing"), busy: true } : null}
            confirm={{ kind: "press", label: faceId ? approveLabel : t("send.sendNow") }}
            onConfirm={() => void controller.approve(what)}
            onRetry={() => setStep("amount")}
            receipt={receipt}
            journal={{ what, kind: "send", network: intent.network, owner: wallet?.address }}
            sound="send"
          />
        )}
        {!intent.blocking && draft && isOpen(intent) ? (
          <ListRow title={t("send.otherChain")} detail={isUsdc ? t("send.otherChainBridge") : asItself ? t("send.otherChainAsItself", { asset: token.symbol }) : t("send.otherChainConvert", { asset: token.symbol })} onPress={() => void otherChain()} />
        ) : null}
        {isOpen(intent) ? (
          <Button
            label={t("send.cancelSend")}
            variant="ghost"
            disabled={controller.busy}
            onPress={() =>
              void controller.cancel().then(() => {
                if (wide) startOver();
                else leave();
              })
            }
          />
        ) : null}
      </View>
    );
  } else if (step !== "recipient" && recipient) {
    ticket = (
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
        reference={reference}
        onReference={setReference}
        referenceFromCode={Boolean(prefill.memo || prefill.memoId) && reference === (prefill.memo ?? "")}
        balance={balance}
        reserve={feeReserve && isUsdc ? BigInt(feeReserve.reserve) : undefined}
        onReview={() => void review()}
        onAddMoney={fund.open}
        busy={creating || controller.busy}
      />
    );
  }

  const sheets = (
    <>
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
      {intent?.draft ? <AddContactSheet open={saving} onClose={() => setSaving(false)} initialAddress={intent.draft.recipient.address} initialSource="pasted" onSaved={() => setSaving(false)} /> : null}
    </>
  );

  if (wide) {
    return (
      <View style={styles.page}>
        {header}
        <Columns
          stage={<RecipientStep onPick={pickRecipient} selected={recipient?.text} />}
          ticket={ticket ?? <EmptyState icon={UserPlus} why={t("desktop.sendPickWho")} detail={t("desktop.sendPickWhoBody")} />}
        />
        {sheets}
      </View>
    );
  }

  const visible: Step | "status" = settled ? "status" : step;
  return (
    <View style={styles.page}>
      {header}
      <Animated.View key={visible} entering={reduced ? undefined : FadeIn.duration(TIMING.sheetEnter)} exiting={reduced ? undefined : FadeOut.duration(TIMING.sheetExit)} style={styles.page}>
        {ticket ? <PhoneScroll>{ticket}</PhoneScroll> : <RecipientStep onPick={pickRecipient} />}
      </Animated.View>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  plain: { flex: 1, paddingHorizontal: SPACE.inset, paddingTop: SPACE.lg },
  group: { gap: SPACE.lg },
  receipt: { gap: SPACE.md, padding: SPACE.lg },
});
