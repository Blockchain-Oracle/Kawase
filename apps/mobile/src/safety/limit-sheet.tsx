// The editors behind Wallet & limits' rows, in one sheet (P21): a token's daily allowance (or a new one), the
// per-payment cap, the new-recipient cooldown, the allowlist and a temporary raise. Saving asks the api; a lower number
// is saved at once, a higher one turns the sheet into Now → After with the approval (X7). Amounts are typed in the
// token's own units and sent as base units; nothing here decides what is tighter — the api does (planLimitChange).
import * as React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Contact, SafetyChange, SafetyView, TokenOption } from "@kawase/api-client";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { Sheet, SheetInput } from "@kawase/ui-native/components/sheet";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

import { ApprovalPanel } from "./approval-panel";
import { useChangeRunner } from "./use-change-runner";
import { ARC_CHAIN_IDS, fromBaseUnits, toBaseUnits, useSafetyFormat } from "./use-safety";

export type Editor =
  | { kind: "allowance"; token: string; symbol: string; decimals: number; perDay: string | null }
  | { kind: "add_token" }
  | { kind: "per_payment" }
  | { kind: "cooldown" }
  | { kind: "allowlist" }
  | { kind: "raise" };

const USDC_DECIMALS = 6;
const ZERO = 0n;
const ROW_MARK = 32;
const SECONDS_PER_HOUR = 3_600;
const MS_PER_HOUR = 3_600_000;
/** A new token's allowance starts here (in its own units); the person changes it before saving. */
const NEW_ALLOWANCE_DEFAULT = "100";
const RAISE_HOURS = { h1: 1, h24: 24, d3: 72, d7: 168 } as const;

export function LimitSheet({ editor, safety, onClose, onSafety }: { editor: Editor | undefined; safety: SafetyView | undefined; onClose: () => void; onSafety: (safety: SafetyView) => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const format = useSafetyFormat();
  const { user } = useSession();
  const runner = useChangeRunner(onSafety);
  const [current, setCurrent] = React.useState<Editor>();
  const [amount, setAmount] = React.useState("");
  const [second, setSecond] = React.useState("");
  const [tokens, setTokens] = React.useState<TokenOption[]>();
  const [paste, setPaste] = React.useState("");
  const [pasteError, setPasteError] = React.useState(false);
  const [contacts, setContacts] = React.useState<Contact[]>();
  const [raiseTarget, setRaiseTarget] = React.useState<string>("per_payment");
  const [raiseHours, setRaiseHours] = React.useState<keyof typeof RAISE_HOURS>("h24");
  const chainId = ARC_CHAIN_IDS[user?.activeNetwork ?? "testnet"];

  // Each opening starts from the row it came from.
  const { reset } = runner;
  React.useEffect(() => {
    setCurrent(editor);
    reset();
    setPasteError(false);
    setPaste("");
    if (!editor || !safety) return;
    if (editor.kind === "allowance") setAmount(editor.perDay ? fromBaseUnits(editor.perDay, editor.decimals) : NEW_ALLOWANCE_DEFAULT);
    if (editor.kind === "per_payment") setAmount(fromBaseUnits(safety.perPayment.value, USDC_DECIMALS));
    if (editor.kind === "cooldown") {
      setAmount(String(format.hours(safety.cooldown.seconds)));
      setSecond(fromBaseUnits(safety.cooldown.cap, USDC_DECIMALS));
    }
    if (editor.kind === "raise") setAmount("");
    if (editor.kind === "add_token") void api.safety.tokens().then((answer) => setTokens(answer.tokens)).catch(() => setTokens([]));
    if (editor.kind === "allowlist") void api.contacts.list().then((answer) => setContacts(answer.contacts)).catch(() => setContacts([]));
  }, [editor, safety, reset, format]);

  const close = () => {
    runner.reset();
    onClose();
  };
  const submit = async (change: SafetyChange) => {
    const outcome = await runner.submit(change);
    if (outcome === "applied" || outcome === "unchanged") close();
  };
  const confirm = async () => {
    if (await runner.confirm()) close();
  };

  const findPasted = async () => {
    setPasteError(false);
    try {
      const { tokens: found } = await api.safety.tokens(paste.trim());
      const match = found.find((entry) => entry.token.toLowerCase() === paste.trim().toLowerCase());
      if (!match) throw new Error("not found");
      setCurrent({ kind: "allowance", token: match.token, symbol: match.symbol, decimals: match.decimals, perDay: null });
      setAmount(NEW_ALLOWANCE_DEFAULT);
    } catch {
      setPasteError(true);
    }
  };

  let title = "";
  let subtitle: string | undefined;
  let body: React.ReactNode = null;

  if (runner.pending) {
    body = <ApprovalPanel pending={runner.pending} busy={runner.busy} onApprove={() => void confirm()} />;
  } else if (runner.revokeOffer) {
    body = (
      <View className="gap-3">
        <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{t("safety.revokeOffer")}</Text>
        <Button disabled={runner.busy} onPress={() => void runner.doRevoke().then(close)}>
          <Text>{t("safety.revokeOnArc")}</Text>
        </Button>
        <Button variant="ghost" onPress={close}>
          <Text>{t("safety.notNow")}</Text>
        </Button>
      </View>
    );
  } else if (current?.kind === "allowance") {
    title = t("safety.editAllowance", { symbol: current.symbol });
    subtitle = current.perDay ? undefined : t("safety.addTokenSubtitle");
    const units = toBaseUnits(amount, current.decimals);
    body = (
      <View className="gap-4">
        <View className="gap-2">
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.perDay")}</Text>
          <SheetInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" accessibilityLabel={t("safety.perDay")} />
        </View>
        <Button disabled={runner.busy || units === undefined} onPress={() => void submit(units === ZERO ? { kind: "allowance_off", token: current.token } : { kind: "allowance", token: current.token, perDay: (units ?? ZERO).toString() })}>
          <Text>{t("safety.save")}</Text>
        </Button>
        {current.perDay ? (
          <Button variant="ghost" disabled={runner.busy} onPress={() => void submit({ kind: "allowance_off", token: current.token })}>
            <Text className="text-destructive">{t("safety.turnOff")}</Text>
          </Button>
        ) : null}
      </View>
    );
  } else if (current?.kind === "add_token") {
    title = t("safety.addToken");
    subtitle = t("safety.addTokenSubtitle");
    body = (
      <View className="gap-4">
        <ListGroup>
          {(tokens ?? []).map((entry) => (
            <ListRow
              key={entry.token}
              leading={<TokenMark token={{ chainId, address: entry.token, symbol: entry.symbol }} size={ROW_MARK} />}
              title={entry.symbol}
              subtitle={t("safety.addTokenHeld", { amount: format.money(entry.balance, entry.decimals, entry.symbol) })}
              trailing={entry.hasAllowance ? <Text className="text-muted-foreground text-sm">{t("safety.addTokenHas")}</Text> : undefined}
              chevron={!entry.hasAllowance}
              disabled={entry.hasAllowance}
              onPress={() => {
                setCurrent({ kind: "allowance", token: entry.token, symbol: entry.symbol, decimals: entry.decimals, perDay: null });
                setAmount(NEW_ALLOWANCE_DEFAULT);
              }}
            />
          ))}
        </ListGroup>
        <View className="gap-2">
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.addTokenPaste")}</Text>
          <View className="flex-row items-center gap-2">
            <SheetInput value={paste} onChangeText={setPaste} autoCapitalize="none" autoCorrect={false} className="flex-1" placeholder="0x…" accessibilityLabel={t("safety.addTokenPaste")} />
            <Button variant="secondary" disabled={!/^0x[0-9a-fA-F]{40}$/.test(paste.trim())} onPress={() => void findPasted()}>
              <Text>{t("safety.addTokenFind")}</Text>
            </Button>
          </View>
          {pasteError ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{t("safety.addTokenNotFound")}</Text> : null}
        </View>
      </View>
    );
  } else if (current?.kind === "per_payment") {
    title = t("safety.perPayment");
    const units = toBaseUnits(amount, USDC_DECIMALS);
    body = (
      <View className="gap-4">
        <SheetInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" accessibilityLabel={t("safety.perPayment")} />
        <Button disabled={runner.busy || !units} onPress={() => void submit({ kind: "per_payment", value: (units ?? ZERO).toString() })}>
          <Text>{t("safety.save")}</Text>
        </Button>
      </View>
    );
  } else if (current?.kind === "cooldown") {
    title = t("safety.cooldown");
    const hours = Number(amount.replace(",", "."));
    const cap = toBaseUnits(second, USDC_DECIMALS);
    const valid = Number.isFinite(hours) && hours >= 0 && cap !== undefined;
    body = (
      <View className="gap-4">
        <View className="gap-2">
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.cooldownHours")}</Text>
          <SheetInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" accessibilityLabel={t("safety.cooldownHours")} />
        </View>
        <View className="gap-2">
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.cooldownCap")}</Text>
          <SheetInput value={second} onChangeText={setSecond} keyboardType="decimal-pad" accessibilityLabel={t("safety.cooldownCap")} />
        </View>
        <Button disabled={runner.busy || !valid} onPress={() => void submit({ kind: "cooldown", seconds: Math.round(hours * SECONDS_PER_HOUR), cap: (cap ?? ZERO).toString() })}>
          <Text>{t("safety.save")}</Text>
        </Button>
      </View>
    );
  } else if (current?.kind === "allowlist" && safety) {
    title = t("safety.allowlist");
    const listed = new Set(safety.allowlist.entries.map((entry) => entry.contactId));
    const book = (contacts ?? []).filter((contact) => contact.address);
    body = (
      <View className="gap-4">
        <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
          <View className="flex-1 gap-0.5">
            <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("safety.allowlistOnly")}</Text>
            <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("safety.allowlistOnlyHint")}</Text>
          </View>
          <Switch
            checked={safety.allowlist.only}
            disabled={runner.busy}
            onCheckedChange={(on) => void runner.submit({ kind: "allowlist_only", on })}
            accessibilityLabel={t("safety.allowlistOnly")}
          />
        </View>
        {book.length === 0 ? (
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.allowlistNoContacts")}</Text>
        ) : (
          <ListGroup>
            {book.map((contact) => {
              const on = listed.has(contact.id);
              return (
                <ListRow
                  key={contact.id}
                  title={contact.displayName}
                  subtitle={on ? t("safety.allowlistOn") : undefined}
                  trailing={
                    <Button size="sm" variant={on ? "ghost" : "secondary"} disabled={runner.busy} onPress={() => void runner.submit({ kind: "allowlist", contactId: contact.id, on: !on })}>
                      <Text className={on ? "text-destructive" : undefined}>{on ? t("safety.allowlistRemove") : t("safety.allowlistAdd")}</Text>
                    </Button>
                  }
                />
              );
            })}
          </ListGroup>
        )}
      </View>
    );
  } else if (current?.kind === "raise" && safety) {
    title = t("safety.raise");
    subtitle = t("safety.raiseRow");
    const target = safety.allowances.find((entry) => entry.token === raiseTarget);
    const decimals = target?.decimals ?? USDC_DECIMALS;
    const units = toBaseUnits(amount, decimals);
    const until = new Date(Date.now() + RAISE_HOURS[raiseHours] * MS_PER_HOUR).toISOString();
    const base = BigInt(target ? target.perDay : safety.perPayment.value);
    const valid = units !== undefined && units > base;
    body = (
      <View className="gap-4">
        <SegmentedControl
          label={t("safety.raiseWhat")}
          value={raiseTarget}
          onValueChange={setRaiseTarget}
          options={[{ value: "per_payment", label: t("safety.raisePerPayment") }, ...safety.allowances.map((entry) => ({ value: entry.token, label: entry.symbol }))]}
        />
        <View className="gap-2">
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.raiseTo")}</Text>
          <SheetInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={fromBaseUnits(base, decimals)} accessibilityLabel={t("safety.raiseTo")} />
        </View>
        <View className="gap-2">
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("safety.raiseFor")}</Text>
          <SegmentedControl
            label={t("safety.raiseFor")}
            value={raiseHours}
            onValueChange={(value) => setRaiseHours(value as keyof typeof RAISE_HOURS)}
            options={[
              { value: "h1", label: t("safety.hours1") },
              { value: "h24", label: t("safety.hours24") },
              { value: "d3", label: t("safety.days3") },
              { value: "d7", label: t("safety.days7") },
            ]}
          />
        </View>
        <Button
          disabled={runner.busy || !valid}
          onPress={() =>
            void submit(
              target
                ? { kind: "boost", token: target.token, extra: ((units ?? ZERO) - base).toString(), until }
                : { kind: "per_payment_temp", value: (units ?? ZERO).toString(), until },
            )
          }
        >
          <Text>{t("safety.save")}</Text>
        </Button>
      </View>
    );
  }

  return (
    <Sheet
      open={Boolean(editor)}
      onClose={close}
      title={runner.pending ? undefined : title || undefined}
      subtitle={runner.pending ? undefined : subtitle}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
      {...(current?.kind === "allowance" && editor?.kind === "add_token" && !runner.pending ? { onBack: () => setCurrent(editor), backLabel: t("common.back") } : {})}
    >
      {body}
    </Sheet>
  );
}
