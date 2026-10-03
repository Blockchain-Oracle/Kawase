// Home's "Contacts" (surfaces.md Home §10; plan §D "Contacts: quick-send avatars"): the people paid most on this
// network first, then the rest by name, as a row of avatars; a tap opens Send to them, "+" adds someone, and the
// title opens Contacts. A contact whose address change is waiting out its cooldown shows it and does not open Send.
import { useFocusEffect, useRouter } from "expo-router";
import { Clock, Plus } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";

import type { Contact, NetworkId } from "@kawase/api-client";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { contactAddress, useContacts } from "@/contacts/use-contacts";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

const SHOWN = 10;
const AVATAR = 52;
const NAME_WIDTH = 64;

const paidCount = (contact: Contact, network: NetworkId) =>
  contact.addresses.reduce((sum, address) => sum + (address.trust[network]?.paymentCount ?? 0), 0);

export function QuickSend() {
  const { t } = useT();
  const router = useRouter();
  const { user } = useSession();
  const { contacts, refresh } = useContacts();
  const [adding, setAdding] = React.useState(false);
  const network = user?.activeNetwork ?? "testnet";

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const people = [...contacts]
    .filter((contact) => contactAddress(contact))
    .sort((a, b) => paidCount(b, network) - paidCount(a, network) || a.displayName.localeCompare(b.displayName))
    .slice(0, SHOWN);
  if (people.length === 0) return null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Eyebrow className="px-1">{t("contacts.title")}</Eyebrow>
        <Button variant="ghost" size="sm" onPress={() => router.push("/contacts")}>
          <Text className="text-muted-foreground">{t("activity.seeAll")}</Text>
        </Button>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-1">
        {people.map((contact) => {
          const waiting = !contact.address && Boolean(contact.pendingChange);
          return (
            <Pressable
              key={contact.id}
              accessibilityRole="button"
              accessibilityLabel={
                waiting
                  ? `${contact.displayName}, ${t("home.contactWaiting")}`
                  : t("home.sendTo", { name: contact.displayName })
              }
              onPress={() =>
                waiting
                  ? router.push(`/contacts/${contact.id}`)
                  : router.push({ pathname: "/send", params: { to: contact.displayName } })
              }
              className="items-center gap-1.5 active:opacity-70"
              style={{ width: NAME_WIDTH }}
            >
              <View>
                <DefaultAvatar
                  seed={(contactAddress(contact) ?? contact.id).toLowerCase()}
                  size={AVATAR}
                  label={contact.displayName}
                />
                {waiting ? (
                  <View className="bg-card border-border absolute -bottom-0.5 -end-0.5 size-5 items-center justify-center rounded-full border">
                    <Icon as={Clock} className="text-muted-foreground size-3" />
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} className="text-foreground text-xs">
                {contact.displayName}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("contacts.add")}
          onPress={() => setAdding(true)}
          className="items-center gap-1.5 active:opacity-70"
          style={{ width: NAME_WIDTH }}
        >
          <View
            className="bg-secondary items-center justify-center rounded-full"
            style={{ width: AVATAR, height: AVATAR }}
          >
            <Icon as={Plus} className="text-foreground size-5" />
          </View>
          <Text numberOfLines={1} className="text-muted-foreground text-xs">
            {t("contacts.add")}
          </Text>
        </Pressable>
      </ScrollView>
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
