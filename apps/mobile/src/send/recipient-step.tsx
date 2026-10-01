// Who to send to (revamp journey 10, Fomo P22): the search field sits at the bottom and rides the keyboard, with
// Paste and Scan beside it and "Add contact" under it; results grow above it. Results come only from the person's
// own contacts and an exact Kawase @handle — never from history, so a poisoned look-alike from an old transfer can
// never be offered (I3). A full 0x address typed or pasted becomes one "send to this address" row; a partial one
// offers nothing. Addresses and handles are always shown left-to-right in mono.
import * as Clipboard from "expo-clipboard";
import { Clock, ClipboardPaste, ScanLine, UserPlus } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { KeyboardStickyView, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { isAddress } from "viem";

import type { Contact, RecipientMatch } from "@kawase/api-client";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Amount } from "@kawase/ui-native/components/amount";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { useT } from "@/i18n";
import { api } from "@/session/api";

import { shortAddress } from "./copy";

/** The person picked someone: `text` is what the api resolves (a contact's name, "@handle" or an address). */
export type RecipientChoice = { text: string; title: string; subtitle: string | null; seed: string };

const SEARCH_DEBOUNCE_MS = 250;
const AVATAR = 44;
const ROW_MIN_HEIGHT = 64;
const ART_WIDTH = 170;
const FOOTER_GAP = 12;
const QUERY_MAX = 80;
const SKELETON_ROWS = 3;
const SKELETON_TITLE = 120;
const SKELETON_LINE = 90;

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
  if (match.kind === "handle")
    return { text: `@${match.handle}`, title: `@${match.handle}`, subtitle: shortAddress(match.address), seed: match.address.toLowerCase() };
  return {
    text: match.name,
    title: match.name,
    subtitle: match.handle ? `@${match.handle}` : match.address ? shortAddress(match.address) : null,
    seed: (match.address ?? match.contactId).toLowerCase(),
  };
}

function RecipientRow({
  choice,
  note,
  onPress,
}: {
  choice: RecipientChoice;
  note?: string | undefined;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[choice.title, choice.subtitle, note].filter(Boolean).join(", ")}
      onPress={onPress}
      className="active:bg-muted flex-row items-center gap-3 px-4 py-2"
      style={{ minHeight: ROW_MIN_HEIGHT }}
    >
      <DefaultAvatar seed={choice.seed} size={AVATAR} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
          {choice.title}
        </Text>
        {choice.subtitle ? (
          <Amount numberOfLines={1} className="text-muted-foreground text-sm">
            {choice.subtitle}
          </Amount>
        ) : null}
      </View>
      {note ? (
        <View className="bg-muted flex-row items-center gap-1 rounded-full px-2.5 py-1">
          <Icon as={Clock} className="text-muted-foreground size-3.5" />
          <Text className="text-muted-foreground text-xs font-semibold">{note}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Eyebrow className="px-1">{label}</Eyebrow>
      <View className="bg-card border-border overflow-hidden rounded-2xl border">{children}</View>
    </View>
  );
}

export function RecipientStep({ onPick }: { onPick: (choice: RecipientChoice) => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = React.useState("");
  const [matches, setMatches] = React.useState<RecipientMatch[]>();
  const [adding, setAdding] = React.useState(false);
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
  // What the add-contact sheet starts with: the typed address or handle, or the typed name.
  // Anything that starts like an address or a handle belongs in the address field, never in the name.
  const addressLike = /^0x/i.test(trimmed) || trimmed.startsWith("@");

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pt-4" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {matches === undefined ? (
          <View className="bg-card border-border gap-1 rounded-2xl border py-2">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <View key={index} className="flex-row items-center gap-3 px-4" style={{ minHeight: ROW_MIN_HEIGHT }}>
                <Skeleton className="rounded-full" style={{ width: AVATAR, height: AVATAR }} />
                <View className="gap-2">
                  <Skeleton className="h-4 rounded-md" style={{ width: SKELETON_TITLE }} />
                  <Skeleton className="h-3 rounded-md" style={{ width: SKELETON_LINE }} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

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
            {contacts.map((match) => (
              <RecipientRow
                key={match.contactId}
                choice={choiceFromMatch(match)}
                note={match.onHold ? t("send.onHold") : undefined}
                onPress={() => onPick(choiceFromMatch(match))}
              />
            ))}
          </Group>
        ) : null}

        {handles.length ? (
          <Group label={t("send.handleHeading")}>
            {handles.map((match) => (
              <RecipientRow key={match.handle} choice={choiceFromMatch(match)} onPress={() => onPick(choiceFromMatch(match))} />
            ))}
          </Group>
        ) : null}

        {nothing && trimmed ? (
          <Text className="text-muted-foreground py-6 text-center text-base">{t("send.notFound")}</Text>
        ) : null}
        {nothing && !trimmed ? (
          <EmptyState art={<PaperPlane width={ART_WIDTH} id="send-empty-plane" />} title={t("send.emptyTitle")} body={t("send.emptyBody")} layout="section" />
        ) : null}
        <Animated.View style={spacer} />
      </ScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View className="bg-background gap-2 px-5 pt-2" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <View className="flex-row items-center gap-2">
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={t("send.searchPlaceholder")}
              accessibilityLabel={t("send.searchPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={QUERY_MAX}
              returnKeyType="search"
              className={cn("flex-1", /^0x/i.test(trimmed) && "font-mono text-sm")}
            />
            <Button variant="secondary" size="icon" className="size-14 rounded-2xl" accessibilityLabel={t("send.paste")} onPress={() => void paste()}>
              <Icon as={ClipboardPaste} className="size-5" />
            </Button>
            <Button variant="secondary" size="icon" className="size-14 rounded-2xl" accessibilityLabel={t("send.scan")} onPress={() => toast(t("send.scanSoon"))}>
              <Icon as={ScanLine} className="size-5" />
            </Button>
          </View>
          <Button variant="ghost" onPress={() => setAdding(true)}>
            <Icon as={UserPlus} className="text-foreground size-4" />
            <Text>{t("send.addContact")}</Text>
          </Button>
        </View>
      </KeyboardStickyView>

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
    </View>
  );
}
