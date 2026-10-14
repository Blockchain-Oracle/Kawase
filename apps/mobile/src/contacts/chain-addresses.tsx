// A contact's addresses on other chains (contacts on other chains, I4): Alex's Base address, saved once, is where
// "send to Alex on Base" pays — through Move, so the bridges race for it. Each address is versioned like the Arc one: a
// new or changed address waits out the same 24-hour hold before it can be paid, and the row says until when (with
// "Cancel the change"). A contact with no address on a chain is paid at their Arc address there (a Kawase wallet is the
// same on every EVM chain), so adding one is only for people who use a different wallet on that chain.
import { CONTACT_CHAINS, type Contact, type ContactChain, ApiError } from "@kawase/api-client";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { CHAIN_IDS, chainKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import * as React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Button, Panel, SectionLabel, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { Sheet, useSheetClose } from "@/components/sheet/Sheet";
import { notify } from "@/components/toast/notify";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { api } from "@/session/api";

const OTHER_CHAINS = CONTACT_CHAINS.filter((chain): chain is Exclude<ContactChain, "arc"> => chain !== "arc");
const MARK_CHAIN: Record<Exclude<ContactChain, "arc">, number> = {
  base: CHAIN_IDS.base,
  ethereum: CHAIN_IDS.ethereum,
  arbitrum: CHAIN_IDS.arbitrum,
  optimism: CHAIN_IDS.optimism,
  polygon: CHAIN_IDS.polygon,
  avalanche: CHAIN_IDS.avalanche,
};
const HEAD = 6;
const TAIL = 4;
const HALF = 2;
const ADDRESS_MAX = 64;
const ADDRESS_ERRORS: Record<string, string> = {
  address_invalid: "contacts.invalidAddress",
  recipient_unknown: "contacts.unknownHandle",
  recipient_no_wallet: "contacts.noWallet",
  recipient_is_self: "contacts.self",
  validation: "contacts.invalidChainAddress",
};

const short = (address: string) => `${address.slice(0, HEAD)}…${address.slice(-TAIL)}`;
export const contactChainMark = (chain: Exclude<ContactChain, "arc">) => chainKey(MARK_CHAIN[chain]);

export function ContactChains({ contact, onChanged }: { contact: Contact; onChanged: (contact: Contact) => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<string | null>(null);
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const rows = OTHER_CHAINS.flatMap((chain) => {
    const live = contact.addresses.find((address) => address.chain === chain && address.status === "active");
    const held = contact.addresses.find((address) => address.chain === chain && address.status === "pending_cooldown");
    return live || held ? [{ chain, live, held }] : [];
  });

  const cancel = async (chain: ContactChain) => {
    setCancelling(chain);
    try {
      const { contact: saved } = await api.contacts.cancelChange(contact.id, chain);
      onChanged(saved);
      notify.success(t("contacts.changeCancelled"));
    } catch {
      notify.error(t("common.error"));
    } finally {
      setCancelling(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <SectionLabel>{t("contacts.otherChains")}</SectionLabel>
      {rows.length > 0 ? (
        <Panel>
          {rows.map(({ chain, live, held }) => (
            <View key={chain} style={styles.row}>
              <Mark entity={contactChainMark(chain)} size={SIZE.markRow} />
              <View style={styles.text}>
                <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t(`move.chain_${chain}`)}</Text>
                <Text selectable style={[TYPE.rowDetail, styles.ltr, { color: color.text2 }]}>
                  {short((live ?? held)!.address)}
                </Text>
                {held?.activatesAt ? <Text style={[TYPE.meta, { color: color.warn }]}>{t("contacts.chainHeld", { time: time(held.activatesAt) })}</Text> : null}
              </View>
              {held ? (
                <Button label={t("contacts.cancelChange")} variant="ghost" size="sm" block={false} loading={cancelling === chain} onPress={() => void cancel(chain)} />
              ) : (
                <Button
                  label={t("contacts.sendOn", { chain: t(`move.chain_${chain}`) })}
                  variant="secondary"
                  size="sm"
                  block={false}
                  disabled={contact.blocked}
                  onPress={() => router.push({ pathname: "/move", params: { direction: "out", chain, recipient: contact.displayName } })}
                />
              )}
            </View>
          ))}
        </Panel>
      ) : (
        <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("contacts.otherChainsEmpty", { name: contact.displayName })}</Text>
      )}
      <Button label={t("contacts.addChainAddress")} variant="secondary" onPress={() => setAdding(true)} />
      {adding ? (
        <Sheet onClose={() => setAdding(false)} closeLabel={t("common.close")}>
          <AddChainAddress
            contact={contact}
            taken={rows.map((row) => row.chain)}
            onSaved={(saved) => {
              onChanged(saved);
            }}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

function AddChainAddress({ contact, taken, onSaved }: { contact: Contact; taken: readonly ContactChain[]; onSaved: (contact: Contact) => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const close = useSheetClose();
  const [chain, setChain] = React.useState<Exclude<ContactChain, "arc">>(OTHER_CHAINS.find((entry) => !taken.includes(entry)) ?? "base");
  const [value, setValue] = React.useState("");
  const [pasted, setPasted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const address = value.trim();
      const { contact: saved } = await api.contacts.changeAddress(contact.id, { address, source: pasted ? "pasted" : "typed", chain });
      notify.success(t("contacts.chainSaved", { chain: t(`move.chain_${chain}`) }));
      onSaved(saved);
      close();
    } catch (caught) {
      const key = caught instanceof ApiError ? ADDRESS_ERRORS[caught.code] : undefined;
      setError(key ? t(key) : t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.sheet}>
      <Text accessibilityRole="header" style={[TYPE.sheetTitle, styles.center, { color: color.ink }]}>
        {t("contacts.addChainTitle", { name: contact.displayName })}
      </Text>
      <View style={styles.chains} accessibilityRole="radiogroup">
        {OTHER_CHAINS.map((entry) => {
          const on = entry === chain;
          return (
            <Pressable
              key={entry}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                fire("tick");
                setChain(entry);
              }}
              style={[styles.chip, { backgroundColor: on ? color.ink : color.raised2 }]}
            >
              <Mark entity={contactChainMark(entry)} size={SIZE.markChip} />
              <Text style={[TYPE.chipLabel, { color: on ? color.ground : color.ink }]}>{t(`move.chain_${entry}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.field}>
        <TextInput
          accessibilityLabel={t("contacts.chainAddress", { chain: t(`move.chain_${chain}`) })}
          value={value}
          onChangeText={(next) => {
            setValue(next);
            setPasted(false);
            setError(undefined);
          }}
          placeholder={t("contacts.chainAddressPlaceholder")}
          placeholderTextColor={color.text3}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={ADDRESS_MAX}
          style={[TYPE.field, styles.input, styles.ltr, { backgroundColor: color.raised2, color: color.ink }]}
        />
        <Button
          label={t("contacts.paste")}
          variant="secondary"
          size="sm"
          block={false}
          onPress={() =>
            void Clipboard.getStringAsync().then((text) => {
              if (!text.trim()) return;
              setValue(text.trim());
              setPasted(true);
            })
          }
        />
      </View>
      {error ? <Text style={[TYPE.rowDetail, { color: color.destructive }]}>{error}</Text> : null}
      <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("contacts.chainNote", { name: contact.displayName })}</Text>
      <Button label={saving ? t("contacts.saving") : t("contacts.save")} loading={saving} disabled={!value.trim()} onPress={() => void save()} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.lg },
  text: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  ltr: { writingDirection: "ltr" },
  sheet: { gap: SPACE.lg, padding: SPACE.lg },
  center: { textAlign: "center" },
  chains: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, height: SIZE.chipHeight, borderRadius: SIZE.chipHeight / HALF, paddingHorizontal: SPACE.md },
  field: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  input: { flex: 1, minHeight: SIZE.inputHeight, borderRadius: SIZE.inputHeight / HALF, paddingHorizontal: SPACE.lg },
});
