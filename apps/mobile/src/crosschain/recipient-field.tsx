// Who receives a move out of Arc: you by default (nothing to type), or a contact, an @handle or an address. Contacts
// are offered as chips; one with an address saved for the chosen chain wears that chain's mark and comes first, because
// the move pays that address (contacts on other chains, I4: a new or changed address there waits out the same hold as
// on Arc, and the review says so). A contact without one is paid at their Arc address, which is theirs on every EVM
// chain. The field itself is on a quiet plate (no border), and the api resolves what was typed.
import type { Contact } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { useContacts } from "@/contacts/use-contacts";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

const CHIPS = 8;
const HALF = 2;

/** The contact's live address saved for `chain` (not one waiting out its hold), if any. */
export const addressOn = (contact: Contact, chain: string | undefined) =>
  chain ? (contact.addresses.find((address) => address.chain === chain && address.status === "active") ?? null) : null;

export function RecipientField({ value, onChange, chain, chainMark }: { value: string; onChange: (next: string) => void; chain: string | undefined; chainMark: string | undefined }) {
  const { t } = useT();
  const { color } = useTheme();
  const { contacts, refresh } = useContacts();
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  const ranked = React.useMemo(
    () =>
      contacts
        .filter((contact) => !contact.blocked)
        .map((contact) => ({ contact, there: addressOn(contact, chain) }))
        .sort((a, b) => Number(Boolean(b.there)) - Number(Boolean(a.there)))
        .slice(0, CHIPS),
    [contacts, chain],
  );
  const chip = (key: string, label: string, on: boolean, onPress: () => void, mark?: string) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={[styles.chip, { backgroundColor: on ? color.ink : color.raised2 }]}
    >
      {mark ? <Mark entity={mark} size={SIZE.markChip} /> : null}
      <Text style={[TYPE.chipLabel, { color: on ? color.ground : color.ink }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.wrap}>
      <TextInput
        accessibilityLabel={t("move.recipient")}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t("move.recipientPlaceholder")}
        placeholderTextColor={color.text3}
        style={[TYPE.field, styles.input, { backgroundColor: color.raised2, color: color.ink }]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="radiogroup">
        {chip("you", t("move.you"), value.trim() === "", () => onChange(""))}
        {ranked.map(({ contact, there }) => chip(contact.id, contact.displayName, value.trim().toLowerCase() === contact.displayName.toLowerCase(), () => onChange(contact.displayName), there ? chainMark : undefined))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  input: { minHeight: SIZE.inputHeight, borderRadius: SIZE.inputHeight / HALF, paddingHorizontal: SPACE.lg },
  chips: { gap: SPACE.sm, paddingVertical: SPACE.xxs },
  chip: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, height: SIZE.chipHeight, borderRadius: SIZE.chipHeight / HALF, paddingHorizontal: SPACE.md },
});
