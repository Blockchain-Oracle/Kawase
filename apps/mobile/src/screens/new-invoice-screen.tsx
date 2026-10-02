// New invoice (cards/agent-business.md): who it is for, the currency (USDC or EURC, real marks), the lines (what, how
// many, the price), when it is due, a note; the total adds up as you type. Creating it gives it a number, a payment
// link and its on-chain reference, then opens it to send.
import { useRouter } from "expo-router";
import { Plus, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { toast } from "sonner-native";

import { INVOICE_DUE_CHOICES } from "@kawase/config";
import { arcIdentity } from "@kawase/identity";
import { amount as toAmount, formatAmount, parseAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { Chip } from "@/marketplace/parts";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

type Line = { description: string; quantity: string; unitPrice: string };
const DUE_CHOICES = INVOICE_DUE_CHOICES;
const MARK_SIZE = 20;
const EMPTY_LINE: Line = { description: "", quantity: "1", unitPrice: "" };
const DECIMAL = /^\d+(\.\d+)?$/;
const WHOLE = /^[1-9]\d*$/;

export function NewInvoiceScreen() {
  const { t } = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const { user } = useSession();
  const ids = arcIdentity(user?.activeNetwork ?? "testnet");
  const [client, setClient] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [asset, setAsset] = React.useState<"USDC" | "EURC">("USDC");
  const [lines, setLines] = React.useState<Line[]>([{ ...EMPTY_LINE }]);
  const [due, setDue] = React.useState<number>(DUE_CHOICES[1]);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const valid = lines.every((line) => line.description.trim() && WHOLE.test(line.quantity) && DECIMAL.test(line.unitPrice));
  const total = valid
    ? lines.reduce((sum, line) => sum + parseAmount(line.unitPrice, asset, "en").baseUnits * BigInt(line.quantity), BigInt(0))
    : undefined;
  const set = (index: number, change: Partial<Line>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...change } : line)));

  const create = async () => {
    setBusy(true);
    try {
      const { invoice } = await api.business.createInvoice({
        clientName: client,
        ...(email.trim() ? { clientEmail: email } : {}),
        asset,
        lines: lines.map((line) => ({ description: line.description, quantity: Number(line.quantity), unitPrice: line.unitPrice })),
        dueInDays: due,
        ...(note.trim() ? { note } : {}),
      });
      router.replace({ pathname: "/business/invoice/[id]", params: { id: invoice.id } });
    } catch {
      toast(t("common.error"));
      setBusy(false);
    }
  };

  return (
    <Page title={t("business.newInvoice")}>
      <Section title={t("business.client")}>
        <Input value={client} onChangeText={setClient} placeholder={t("business.clientName")} />
        <Input value={email} onChangeText={setEmail} placeholder={t("business.clientEmail")} keyboardType="email-address" autoCapitalize="none" />
      </Section>
      <Section title={t("business.currency")}>
        <View className="flex-row gap-2">
          {(["USDC", "EURC"] as const).map((entry) => (
            <Pressable
              key={entry}
              accessibilityRole="radio"
              accessibilityState={{ checked: asset === entry }}
              onPress={() => setAsset(entry)}
              className={cn("flex-row items-center gap-2 rounded-full border px-3.5 py-2", asset === entry ? "bg-primary border-primary" : "bg-card border-border")}
            >
              <Mark entity={entry === "USDC" ? ids.usdc : ids.eurc} size={MARK_SIZE} />
              <Text className={cn("text-sm font-semibold", asset === entry ? "text-primary-foreground" : "text-foreground")}>{entry}</Text>
            </Pressable>
          ))}
        </View>
      </Section>
      <Section title={t("business.lines")}>
        {lines.map((line, index) => (
          <View key={index} className="bg-card border-border gap-2 rounded-3xl border p-3">
            <View className="flex-row items-center gap-2">
              <Input className="flex-1" value={line.description} onChangeText={(value) => set(index, { description: value })} placeholder={t("business.lineDescription")} />
              {lines.length > 1 ? (
                <Button variant="ghost" size="icon" accessibilityLabel={t("business.removeLine")} onPress={() => setLines((current) => current.filter((_, i) => i !== index))}>
                  <Icon as={X} className="size-4" />
                </Button>
              ) : null}
            </View>
            <View className="flex-row gap-2">
              <Input className="w-20" value={line.quantity} onChangeText={(value) => set(index, { quantity: value })} keyboardType="number-pad" placeholder="1" accessibilityLabel={t("business.quantity")} />
              <Input className="flex-1" value={line.unitPrice} onChangeText={(value) => set(index, { unitPrice: value.replace(",", ".") })} keyboardType="decimal-pad" placeholder={t("business.unitPrice", { asset })} />
            </View>
          </View>
        ))}
        <Button variant="secondary" onPress={() => setLines((current) => [...current, { ...EMPTY_LINE }])}>
          <Icon as={Plus} className="size-4" />
          <Text>{t("business.addLine")}</Text>
        </Button>
      </Section>
      <Section title={t("business.due")}>
        <View className="flex-row flex-wrap gap-2">
          {DUE_CHOICES.map((days) => (
            <Chip key={days} label={t("business.inDays", { days: String(days) })} selected={due === days} onPress={() => setDue(days)} />
          ))}
        </View>
        <Input value={note} onChangeText={setNote} placeholder={t("business.note")} />
      </Section>
      <View className="flex-row items-center justify-between px-1">
        <Text className={cn("text-muted-foreground text-base", TEXT_START)}>{t("business.total")}</Text>
        <Amount className="text-foreground text-2xl font-semibold">{total !== undefined ? formatAmount(toAmount(asset, total), locale) : "—"}</Amount>
      </View>
      <Button disabled={busy || !client.trim() || !valid || !total} onPress={() => void create()}>
        <Text>{busy ? t("common.loading") : t("business.create")}</Text>
      </Button>
    </Page>
  );
}
