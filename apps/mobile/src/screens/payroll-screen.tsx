// Payroll (cards/agent-business.md): the same payment to several people every month (or week). Each payee is its own
// scheduled send with its own limit on chain; Turn on signs every limit with one Face ID. Lines show their status
// (a payee whose address changed waits for review); pause, resume or cancel the whole payroll. Runs, skips and receipts
// are in Automations.
import { useFocusEffect, useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";
import type { TypedDataDefinition } from "viem";

import type { PayrollView } from "@kawase/api-client";
import { PAYROLL_MONTHDAYS } from "@kawase/config";
import { amount as toAmount, formatAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";
import { Textarea } from "@kawase/ui-native/components/ui/textarea";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { parseLines } from "@/business/lines";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { Chip } from "@/marketplace/parts";
import { shortAddress } from "@/send/copy";
import { api } from "@/session/api";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const DAYS = PAYROLL_MONTHDAYS;
const TEXTAREA_LINES = 5;

function PayrollCard({ payroll, onChange }: { payroll: PayrollView; onChange: (next: PayrollView) => void }) {
  const { t } = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [busy, setBusy] = React.useState(false);
  const drafts = payroll.lines.filter((line) => line.status === "draft");
  const blocked = drafts.filter((line) => line.blocking);
  const live = payroll.lines.filter((line) => line.status === "active" || line.status === "paused");
  const paused = live.length > 0 && live.every((line) => line.status === "paused");

  const turnOn = async () => {
    if (!signer) return;
    const yes = await confirmWithBiometrics(t("business.payrollPrompt", { name: payroll.name }), t("common.cancel"));
    if (yes !== "approved") return;
    setBusy(true);
    try {
      const { lines } = await api.business.payrollGrant(payroll.id);
      const signed = [];
      for (const line of lines) {
        const signatures = [];
        for (const grant of line.request.grants) signatures.push({ grantId: grant.grantId, signature: await signer.signTypedData(grant.typedData as TypedDataDefinition) });
        signed.push({ automationId: line.automationId, signatures });
      }
      onChange((await api.business.activatePayroll(payroll.id, signed)).payroll);
      toast(t("business.payrollOn"));
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };
  const change = async (next: "pause" | "resume" | "cancel") => {
    setBusy(true);
    try {
      onChange((await api.business.changePayroll(payroll.id, next)).payroll);
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3">
      <ListGroup label={payroll.name}>
        {payroll.lines.map((line) => (
          <ListRow
            key={line.id}
            title={line.action?.recipientName ?? (line.action?.recipientAddress ? shortAddress(line.action.recipientAddress) : (line.action?.recipientWords ?? ""))}
            subtitle={line.blocking ? t(`policy.${line.blocking.code}`) : t(`business.lineStatus.${line.status}`)}
            trailing={line.action ? <Amount className="text-foreground text-sm">{formatAmount(toAmount(line.action.asset, BigInt(line.action.amount)), locale)}</Amount> : undefined}
            onPress={() => router.push("/automations")}
          />
        ))}
      </ListGroup>
      <View className="flex-row flex-wrap gap-2">
        {drafts.length > 0 && blocked.length === 0 ? (
          <Button size="sm" disabled={busy} onPress={() => void turnOn()}>
            <Text>{t("business.turnOn")}</Text>
          </Button>
        ) : null}
        {live.length > 0 ? (
          <Button size="sm" variant="secondary" disabled={busy} onPress={() => void change(paused ? "resume" : "pause")}>
            <Text>{paused ? t("automation.resume") : t("automation.pause")}</Text>
          </Button>
        ) : null}
        {live.length > 0 || drafts.length > 0 ? (
          <Button size="sm" variant="ghost" disabled={busy} onPress={() => void change("cancel")}>
            <Text className="text-destructive">{t("automation.cancel")}</Text>
          </Button>
        ) : null}
      </View>
      {blocked.length > 0 ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("business.payrollFix")}</Text> : null}
    </View>
  );
}

export function PayrollScreen() {
  const { t } = useT();
  const [list, setList] = React.useState<PayrollView[]>([]);
  const [name, setName] = React.useState("");
  const [day, setDay] = React.useState<number>(DAYS[0]);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const parsed = parseLines(text);

  const load = React.useCallback(async () => {
    setList((await api.business.payrolls().catch(() => ({ payrolls: [] }))).payrolls);
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const create = async () => {
    setBusy(true);
    try {
      const { payroll } = await api.business.createPayroll({ name, every: "month", monthday: day, payees: parsed.lines });
      setList((current) => [payroll, ...current]);
      setName("");
      setText("");
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t("business.payroll")}>
      {list.map((payroll) => (
        <PayrollCard key={payroll.id} payroll={payroll} onChange={(next) => setList((current) => current.map((entry) => (entry.id === next.id ? next : entry)))} />
      ))}
      <Section title={t("business.newPayroll")}>
        <Input value={name} onChangeText={setName} placeholder={t("business.payrollName")} />
        <View className="flex-row flex-wrap gap-2">
          {DAYS.map((entry) => (
            <Chip key={entry} label={t("business.monthday", { day: String(entry) })} selected={day === entry} onPress={() => setDay(entry)} />
          ))}
        </View>
        <Textarea value={text} onChangeText={setText} numberOfLines={TEXTAREA_LINES} placeholder={t("business.linesPlaceholder")} autoCapitalize="none" autoCorrect={false} />
        {parsed.bad.length > 0 ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{t("business.badLines", { lines: parsed.bad.join(", ") })}</Text> : null}
        <Button disabled={busy || !name.trim() || parsed.lines.length === 0 || parsed.bad.length > 0} onPress={() => void create()}>
          <Text>{busy ? t("common.loading") : t("business.draftPayroll", { count: String(parsed.lines.length) })}</Text>
        </Button>
        <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("business.payrollNote")}</Text>
      </Section>
    </Page>
  );
}
