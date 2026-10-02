// Contacts (revamp 10c; I1–I7): the people the person pays, searchable by name, alias, @handle or address, each
// row saying whether their address is on hold or was paid before on this network. Adding uses the same sheet as
// the send screen and the chat ("Alex isn't in your contacts" → Add Alex). Loading shows skeleton rows, an error
// keeps what was already shown with a retry, a guest is asked to sign in, and an empty book says why it is worth
// filling. Import from the phone's contacts (I7) arrives in Stage 5c, and the page says so instead of hiding it.
import { useFocusEffect, useRouter } from "expo-router";
import { ContactRound, Search, UserPlus } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { ContactRow, ContactRowSkeleton } from "@/contacts/contact-row";
import { ContactsHeader } from "@/contacts/screen-header";
import { contactAddress, useContacts } from "@/contacts/use-contacts";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

const ART_WIDTH = 160;
const SKELETON_ROWS = 4;
const BOTTOM_GAP = 16;
const SEARCH_MAX = 80;

export function ContactsScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { status: load, contacts, refresh } = useContacts();
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const network = user?.activeNetwork ?? "testnet";
  const account = status === "account";

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const text = query.trim().replace(/^@/, "").toLowerCase();
  const shown = text
    ? contacts.filter(
        (contact) =>
          contact.displayName.toLowerCase().includes(text) ||
          contact.aliases.some((alias) => alias.toLowerCase().includes(text)) ||
          contact.handle?.toLowerCase().includes(text) ||
          contactAddress(contact)?.toLowerCase().includes(text),
      )
    : contacts;

  const addButton = account ? (
    <View className="flex-row gap-2">
      {/* Import from the phone's contacts (A5-2, I7). */}
      <Button variant="secondary" size="icon" accessibilityLabel={t("importContacts.title")} className="size-11" onPress={() => router.push("/contacts/import")}>
        <Icon as={ContactRound} className="size-5" />
      </Button>
      <Button variant="secondary" size="icon" accessibilityLabel={t("contacts.add")} className="size-11" onPress={() => setAdding(true)}>
        <Icon as={UserPlus} className="size-5" />
      </Button>
    </View>
  ) : undefined;

  let body: React.ReactNode;
  if (!account) {
    body = (
      <EmptyState
        art={<Koban width={ART_WIDTH} />}
        title={t("contacts.title")}
        body={t("contacts.signInBody")}
        action={
          <Button onPress={() => signIn.open()}>
            <Text>{t("signIn.title")}</Text>
          </Button>
        }
      />
    );
  } else if ((load === "loading" || load === "idle") && contacts.length === 0) {
    body = (
      <View className="px-5 pt-5">
        <ListGroup>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <ContactRowSkeleton key={index} />
          ))}
        </ListGroup>
      </View>
    );
  } else if (load === "error" && contacts.length === 0) {
    body = (
      <EmptyState
        art={<Koban width={ART_WIDTH} />}
        title={t("contacts.loadFailed")}
        action={
          <Button variant="secondary" onPress={() => void refresh()}>
            <Text>{t("common.retry")}</Text>
          </Button>
        }
      />
    );
  } else if (contacts.length === 0) {
    body = (
      <View className="flex-1">
        <EmptyState
          art={<CoinStack width={ART_WIDTH} />}
          title={t("contacts.emptyTitle")}
          body={t("contacts.emptyBody")}
          action={
            <Button onPress={() => setAdding(true)}>
              <Icon as={UserPlus} className="text-primary-foreground size-4" />
              <Text>{t("contacts.add")}</Text>
            </Button>
          }
        />
        <Text className="text-muted-foreground px-5 text-center text-sm" style={{ paddingBottom: insets.bottom + BOTTOM_GAP }}>
          {t("contacts.importSoon")}
        </Text>
      </View>
    );
  } else {
    body = (
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_GAP }}
      >
        <View className="bg-muted flex-row items-center gap-2 rounded-2xl ps-4">
          <Icon as={Search} className="text-muted-foreground size-5" />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={t("contacts.search")}
            accessibilityLabel={t("contacts.search")}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={SEARCH_MAX}
            returnKeyType="search"
            className="flex-1 bg-transparent ps-2"
          />
        </View>
        {load === "error" ? (
          <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
            <Text className={cn("text-foreground flex-1 text-sm", TEXT_START)}>{t("contacts.loadFailed")}</Text>
            <Button variant="ghost" size="sm" onPress={() => void refresh()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          </View>
        ) : null}
        {shown.length > 0 ? (
          <ListGroup>
            {shown.map((contact) => (
              <ContactRow key={contact.id} contact={contact} network={network} onPress={() => router.push(`/contacts/${contact.id}`)} />
            ))}
          </ListGroup>
        ) : (
          <Text className="text-muted-foreground py-6 text-center text-base">{t("contacts.noMatches")}</Text>
        )}
        <Text className="text-muted-foreground px-1 text-center text-sm">{t("contacts.importSoon")}</Text>
      </ScrollView>
    );
  }

  return (
    <View className="bg-background flex-1">
      <ContactsHeader title={t("contacts.title")} end={addButton} />
      {body}
      <AddContactSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          void refresh();
        }}
      />
    </View>
  );
}
