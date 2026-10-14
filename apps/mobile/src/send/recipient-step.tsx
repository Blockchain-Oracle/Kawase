// Who (revamp journey 10, the recipient step), on the Senryo kit (21st.dev felipemenezes098 "People Picker" 24801 as the
// spec): the search for a name, a @handle or a pasted address leads the page at full width under the title, with one
// row of pills under it — Paste · Scan · Add contact (each said once); results follow in filled groups (a full address,
// contacts, handles) as kit rows with each person's avatar; a contact on hold says so. Loading is the list's own
// skeleton; nothing found says so; no contacts yet says why in one quiet line (the pills are the actions).
import * as Clipboard from "expo-clipboard";
import { ClipboardPaste, Clock, ScanLine, UserPlus } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isAddress } from "viem";

import type { Contact, RecipientMatch } from "@kawase/api-client";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { useWide } from "@kawase/ui-native/lib/wide";

import { EmptyState, Icon, LoadingState, Panel, RADIUS, SearchField, SectionLabel, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { ScanModal } from "@/scan/scan-modal";
import { api } from "@/session/api";

import { shortAddress } from "./copy";

/** The person picked someone: `text` is what the api resolves (a contact's name, "@handle" or an address). */
export type RecipientChoice = { text: string; title: string; subtitle: string | null; seed: string };

const SEARCH_DEBOUNCE_MS = 250;
const AVATAR = 44;
const QUERY_MAX = 80;

/** A choice from what was typed, before anything is known about it (a prefilled `to`). */
export function choiceFromText(text: string): RecipientChoice {
  const value = text.trim();
  return { text: value, title: /^0x/i.test(value) ? shortAddress(value) : value, subtitle: null, seed: value.toLowerCase() };
}

export function choiceFromContact(contact: Contact): RecipientChoice {
  return {
    text: contact.displayName,
    title: contact.displayName,
    subtitle: contact.handle ? `@${contact.handle}` : contact.address ? shortAddress(contact.address) : null,
    seed: (contact.address ?? contact.id).toLowerCase(),
  };
}

function choiceFromMatch(match: RecipientMatch): RecipientChoice {
  if (match.kind === "handle") return { text: `@${match.handle}`, title: `@${match.handle}`, subtitle: shortAddress(match.address), seed: match.address.toLowerCase() };
  return {
    text: match.name,
    title: match.name,
    subtitle: match.handle ? `@${match.handle}` : match.address ? shortAddress(match.address) : null,
    seed: (match.address ?? match.contactId).toLowerCase(),
  };
}

function RecipientRow({ choice, note, selected, onPress }: { choice: RecipientChoice; note?: string | undefined; selected?: boolean; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={[choice.title, choice.subtitle, note].filter(Boolean).join(", ")}
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: selected ? color.selectedRow : pressed ? color.rowPressed : color.transparent }]}
    >
      <DefaultAvatar seed={choice.seed} size={AVATAR} />
      <View style={styles.grow}>
        <Text numberOfLines={1} style={[TYPE.rowStrong, { color: color.ink }]}>
          {choice.title}
        </Text>
        {choice.subtitle ? (
          <Text numberOfLines={1} style={[TYPE.rowDetail, { color: color.text3 }]}>
            {choice.subtitle}
          </Text>
        ) : null}
      </View>
      {note ? (
        <View style={[styles.note, { backgroundColor: color.raised2 }]}>
          <Icon icon={Clock} size={SIZE.iconSm} tint={color.text2} />
          <Text style={[TYPE.meta, { color: color.text2 }]}>{note}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <SectionLabel>{label}</SectionLabel>
      <Panel>{children}</Panel>
    </View>
  );
}

function PillAction({ icon, label, onPress }: { icon: typeof ClipboardPaste; label: string; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      <Icon icon={icon} size={SIZE.iconSm} tint={color.ink} />
      <Text numberOfLines={1} style={[TYPE.chipLabel, { color: color.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RecipientStep({ onPick, selected }: { onPick: (choice: RecipientChoice) => void; selected?: string | undefined }) {
  const { t } = useT();
  const wide = useWide();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = React.useState("");
  const [matches, setMatches] = React.useState<RecipientMatch[]>();
  const [adding, setAdding] = React.useState(false);
  // Scan to pay (A5-2): the scanner opens over this step; a code replaces Send with the flow it asks for.
  const [scanning, setScanning] = React.useState(false);
  const latest = React.useRef(0);
  const { height } = useReanimatedKeyboardAnimation();
  // The list scrolls clear of the keyboard: a spacer as tall as the keyboard under the last row.
  const spacer = useAnimatedStyle(() => ({ height: Math.abs(height.value) }));

  const trimmed = query.trim();
  const fullAddress = /^0x/i.test(trimmed) && isAddress(trimmed, { strict: false });

  React.useEffect(() => {
    const request = ++latest.current;
    const timer = setTimeout(() => {
      api.recipients
        .search(trimmed)
        .then(({ matches: found }) => {
          if (request === latest.current) setMatches(found);
        })
        .catch(() => {
          if (request === latest.current) setMatches([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) setQuery(text.slice(0, QUERY_MAX));
  };

  const contacts = (matches ?? []).filter((match): match is Extract<RecipientMatch, { kind: "contact" }> => match.kind === "contact");
  const handles = (matches ?? []).filter((match): match is Extract<RecipientMatch, { kind: "handle" }> => match.kind === "handle");
  const nothing = matches !== undefined && contacts.length === 0 && handles.length === 0 && !fullAddress;
  // What the add-contact sheet starts with: the typed address or handle, or the typed name. Anything that starts like
  // an address or a handle belongs in the address field, never in the name.
  const addressLike = /^0x/i.test(trimmed) || trimmed.startsWith("@");

  const search = (
    <View style={styles.search}>
      <SearchField value={query} onChange={(next) => setQuery(next.slice(0, QUERY_MAX))} placeholder={t("send.searchPlaceholder")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pills}>
        <PillAction icon={ClipboardPaste} label={t("send.paste")} onPress={() => void paste()} />
        <PillAction icon={ScanLine} label={t("send.scan")} onPress={() => setScanning(true)} />
        <PillAction icon={UserPlus} label={t("send.addContact")} onPress={() => setAdding(true)} />
      </ScrollView>
    </View>
  );

  const results = (
    <>
      {matches === undefined ? <LoadingState shape="list" /> : null}
      {fullAddress ? (
        <Group label={t("send.addressHeading")}>
          <RecipientRow
            choice={{ text: trimmed, title: t("send.sendToAddress"), subtitle: shortAddress(trimmed), seed: trimmed.toLowerCase() }}
            onPress={() => onPick({ text: trimmed, title: shortAddress(trimmed), subtitle: null, seed: trimmed.toLowerCase() })}
          />
        </Group>
      ) : null}
      {contacts.length ? (
        <Group label={t("send.contactsHeading")}>
          {contacts.map((match) => {
            const choice = choiceFromMatch(match);
            return <RecipientRow key={match.contactId} choice={choice} selected={selected === choice.text} note={match.onHold ? t("send.onHold") : undefined} onPress={() => onPick(choice)} />;
          })}
        </Group>
      ) : null}
      {handles.length ? (
        <Group label={t("send.handleHeading")}>
          {handles.map((match) => {
            const choice = choiceFromMatch(match);
            return <RecipientRow key={match.handle} choice={choice} selected={selected === choice.text} onPress={() => onPick(choice)} />;
          })}
        </Group>
      ) : null}
      {nothing && trimmed ? <EmptyState why={t("send.notFound")} action={{ label: t("send.addContact"), onPress: () => setAdding(true) }} size="inline" /> : null}
      {nothing && !trimmed ? <EmptyState icon={UserPlus} why={t("send.emptyTitle")} detail={t("send.emptyBody")} size="inline" /> : null}
    </>
  );

  const sheets = (
    <>
      <AddContactSheet
        open={adding}
        onClose={() => setAdding(false)}
        initialName={addressLike ? undefined : trimmed || undefined}
        initialAddress={addressLike ? trimmed : undefined}
        initialSource={fullAddress ? "pasted" : undefined}
        onSaved={(contact) => {
          setAdding(false);
          onPick(choiceFromContact(contact));
        }}
      />
      <ScanModal open={scanning} origin="send" onClose={() => setScanning(false)} />
    </>
  );

  if (wide) {
    return (
      <View style={styles.wide}>
        {search}
        {results}
        {sheets}
      </View>
    );
  }
  return (
    <View style={styles.flex}>
      <View style={[styles.header, { backgroundColor: color.ground }]}>{search}</View>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + SPACE.xl }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {results}
        <Animated.View style={spacer} />
      </ScrollView>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wide: { gap: SPACE.lg },
  list: { gap: SPACE.lg, paddingHorizontal: SPACE.inset, paddingTop: SPACE.sm },
  header: { paddingHorizontal: SPACE.inset, paddingTop: SPACE.xs, paddingBottom: SPACE.sm },
  search: { gap: SPACE.md },
  pills: { gap: SPACE.sm },
  pill: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, height: SIZE.chipHeight, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.md },
  group: { gap: SPACE.sm },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, minHeight: SIZE.rowMinHeight },
  grow: { flex: 1, minWidth: 0 },
  note: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xxs },
});
