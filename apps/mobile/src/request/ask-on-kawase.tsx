// "Ask on Kawase" (A5-3): for an open request, ask someone who is on Kawase in the app as well — "@abu asked you for
// 12 USDC" lands in their inbox and as a push, and the tap opens the pay card. Who it is comes from the person's own
// words: an @handle typed, or a saved contact with one (a chip). Anyone else keeps getting the link; the api says
// when the name is not someone on Kawase, and the card says so instead of guessing.
import { BellRing } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { toast } from "sonner-native";

import { ApiError, type PaymentRequest } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useContacts } from "@/contacts/use-contacts";
import { useT } from "@/i18n";
import { api } from "@/session/api";

const CHIPS = 6;
const WORDS_MAX = 80;

export function AskOnKawase({ request }: { request: PaymentRequest }) {
  const { t } = useT();
  const { contacts, refresh } = useContacts();
  const [asked, setAsked] = React.useState(request.payer?.handle ?? null);
  const [open, setOpen] = React.useState(false);
  const [words, setWords] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setAsked(request.payer?.handle ?? null), [request.payer?.handle]);
  // The person's contacts on Kawase, as one-tap chips, once they open it.
  React.useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const ask = async (who: string) => {
    if (!who.trim()) return;
    setBusy(true);
    try {
      const { request: next } = await api.requests.ask(request.id, who.trim());
      const handle = next.payer?.handle ?? null;
      setAsked(handle);
      setOpen(false);
      setWords("");
      if (handle) toast(t("request.askedToast", { name: `@${handle}` }));
    } catch (error) {
      toast(error instanceof ApiError && error.code === "recipient_unknown" ? t("request.askNotOnKawase", { name: who.trim() }) : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return asked ? (
      <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
        <Icon as={BellRing} className="text-foreground size-4" />
        <Text className={cn("text-foreground min-w-0 flex-1 text-sm", TEXT_START)}>{t("request.askedInApp", { name: `@${asked}` })}</Text>
        <Button variant="ghost" size="sm" onPress={() => setOpen(true)}>
          <Text className="text-muted-foreground">{t("request.askSomeoneElse")}</Text>
        </Button>
      </View>
    ) : (
      <Button variant="secondary" onPress={() => setOpen(true)}>
        <Icon as={BellRing} className="size-4" />
        <Text>{t("request.askOnKawase")}</Text>
      </Button>
    );
  }

  const onKawase = contacts.filter((contact) => contact.handle).slice(0, CHIPS);
  return (
    <View className="bg-card border-border gap-3 rounded-2xl border p-3">
      <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("request.askBody")}</Text>
      <View className="flex-row items-center gap-2">
        <Input
          value={words}
          onChangeText={setWords}
          placeholder={t("request.askPlaceholder")}
          accessibilityLabel={t("request.askPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={WORDS_MAX}
          returnKeyType="send"
          onSubmitEditing={() => void ask(words)}
          className="flex-1"
        />
        <Button disabled={busy || !words.trim()} onPress={() => void ask(words)}>
          <Text>{t("request.ask")}</Text>
        </Button>
      </View>
      {onKawase.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {onKawase.map((contact) => (
            <Pressable
              key={contact.id}
              accessibilityRole="button"
              accessibilityLabel={t("request.askName", { name: contact.displayName })}
              disabled={busy}
              onPress={() => void ask(`@${contact.handle!}`)}
              className="bg-secondary active:opacity-70 flex-row items-center gap-1 rounded-full px-3 py-1.5"
            >
              <Text className="text-foreground text-sm">{contact.displayName}</Text>
              <Text className="text-muted-foreground text-xs">@{contact.handle}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Button variant="ghost" size="sm" onPress={() => setOpen(false)}>
        <Text className="text-muted-foreground">{t("common.cancel")}</Text>
      </Button>
    </View>
  );
}
