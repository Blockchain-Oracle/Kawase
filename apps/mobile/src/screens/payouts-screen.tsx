// Batch payouts (cards/agent-business.md): paste or type "who, amount" lines (contacts, @handles or addresses; a CSV
// works), pick the token (USDC, EURC, or anything else the wallet holds on Arc — R1), check: every line is resolved and checked like a send; then one Face ID signs one
// transaction that pays everyone, all or nothing. Past payouts below with their transaction.
import { useFocusEffect } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import { toast } from "sonner-native";
import { arc, arcTestnet } from "viem/chains";

import type { PayoutProblem, PayoutView } from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { Textarea } from "@kawase/ui-native/components/ui/textarea";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { assetParam, TokenChoice, USDC_CHOICE, type TokenChoiceValue } from "@/business/token-choice";
import { parseLines } from "@/business/lines";
import { signAndSubmitPayout } from "@/business/sign-payout";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { shortAddress } from "@/send/copy";
import { sayIfPractice } from "@/safety/practice-refusal";
import { api } from "@/session/api";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const EXPLORER = { testnet: `${arcTestnet.blockExplorers?.default.url ?? ""}/tx/`, mainnet: `${arc.blockExplorers?.default.url ?? ""}/tx/` } as const;
const TEXTAREA_LINES = 6;

export function PayoutsScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [asset, setAsset] = React.useState<TokenChoiceValue>(USDC_CHOICE);
  const [text, setText] = React.useState("");
  const [draft, setDraft] = React.useState<PayoutView>();
  const [problems, setProblems] = React.useState<PayoutProblem[]>([]);
  const [history, setHistory] = React.useState<PayoutView[]>([]);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setHistory((await api.business.payouts().catch(() => ({ payouts: [] }))).payouts.filter((payout) => payout.status !== "ready"));
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const money = (baseUnits: string, of: { asset: string; decimals: number } = { asset: asset.symbol, decimals: asset.decimals }) => formatTokenAmount(BigInt(baseUnits), of.decimals, of.asset, locale);
  const parsed = parseLines(text);

  const check = async () => {
    setBusy(true);
    try {
      const result = await api.business.createPayout({ asset: assetParam(asset), lines: parsed.lines });
      setProblems(result.problems);
      setDraft(result.payout ?? undefined);
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!draft || !signer) return;
    const yes = await confirmWithBiometrics(t("business.payoutPrompt", { count: String(draft.lines.length), amount: money(draft.total, draft) }), t("common.cancel"));
    if (yes !== "approved") return;
    setBusy(true);
    try {
      const payout = await signAndSubmitPayout(signer, draft.id);
      toast(payout.status === "confirmed" ? t("business.payoutSent", { count: String(payout.lines.length) }) : t("business.payoutFailed"));
      setDraft(undefined);
      setText("");
      await load();
    } catch (error) {
      if (!sayIfPractice(error, t)) toast(t("business.payoutFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t("business.payouts")}>
      <Section title={t("business.newPayout")}>
        <TokenChoice value={asset} onChange={setAsset} />
        <Textarea
          value={text}
          onChangeText={(value) => {
            setText(value);
            setDraft(undefined);
            setProblems([]);
          }}
          numberOfLines={TEXTAREA_LINES}
          placeholder={t("business.linesPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {parsed.bad.length > 0 ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{t("business.badLines", { lines: parsed.bad.join(", ") })}</Text> : null}
        {problems.map((entry) => (
          <Text key={entry.index} className={cn("text-destructive text-sm", TEXT_START)}>
            {t("business.lineProblem", { who: entry.recipient, problem: t(`business.problem.${["amount", "self", "lookalike", "token_contract", "invalid"].includes(entry.problem) ? entry.problem : "unknown"}`) })}
          </Text>
        ))}
        {!draft ? (
          <Button disabled={busy || parsed.lines.length === 0 || parsed.bad.length > 0} onPress={() => void check()}>
            <Text>{busy ? t("common.loading") : t("business.checkLines", { count: String(parsed.lines.length) })}</Text>
          </Button>
        ) : (
          <View className="gap-3">
            <ListGroup>
              {draft.lines.map((line, index) => (
                <ListRow key={`${index}-${line.address}`} title={line.name ?? shortAddress(line.address)} subtitle={line.name ? shortAddress(line.address) : undefined} trailing={<Amount className="text-foreground text-sm">{money(line.amount, draft)}</Amount>} />
              ))}
            </ListGroup>
            <Button disabled={busy} onPress={() => void pay()}>
              <Text>{busy ? t("common.loading") : t("business.payAll", { count: String(draft.lines.length), amount: money(draft.total, draft) })}</Text>
            </Button>
          </View>
        )}
      </Section>
      {history.length > 0 ? (
        <Section title={t("business.pastPayouts")}>
          <ListGroup>
            {history.map((payout) => (
              <ListRow
                key={payout.id}
                title={t("business.payoutRow", { count: String(payout.lines.length), amount: money(payout.total, payout) })}
                subtitle={payout.status === "confirmed" ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(payout.createdAt)) : t("business.payoutFailed")}
                {...(payout.txHash ? { trailing: <Icon as={ExternalLink} className="text-muted-foreground size-4" />, onPress: () => void Linking.openURL(`${EXPLORER[payout.network]}${payout.txHash}`) } : {})}
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}
    </Page>
  );
}
