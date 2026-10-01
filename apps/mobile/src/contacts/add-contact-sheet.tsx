// The add-contact sheet (I1/I2, revamp 10c): a name and an address or @handle (with Paste). Where the address came
// from (pasted, scanned, received, an @handle, typed) is known from how it arrived, never asked, and becomes the
// trust chip on every later send. The same sheet opens from the send screen,
// the contacts page and the chat card ("Alex isn't in your contacts" → Add Alex → the send resumes). The address is
// always shown left-to-right. Errors from the api stay on the sheet, under the field they belong to.
import * as Clipboard from "expo-clipboard";
import * as React from "react";
import { Keyboard, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { ApiError, type AddressSource, type Contact } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { Sheet, SheetInput } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useThemeColors } from "@/theme/use-theme-colors";

const NAME_MAX = 60;
/** Focus waits for the sheet to finish rising, or the keyboard and the sheet fight over the layout. */
const FOCUS_AFTER_MS = MOTION.sheetMs + MOTION.pressMs;
const ADDRESS_MAX = 80;

const ERRORS: Record<string, { field: "name" | "address"; key: string }> = {
  contact_exists: { field: "name", key: "contacts.exists" },
  address_invalid: { field: "address", key: "contacts.invalidAddress" },
  recipient_unknown: { field: "address", key: "contacts.unknownHandle" },
  recipient_no_wallet: { field: "address", key: "contacts.noWallet" },
  recipient_is_self: { field: "address", key: "contacts.self" },
};

type FieldRef = React.ComponentRef<typeof SheetInput>;

export type AddContactSheetProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
  initialName?: string | undefined;
  initialAddress?: string | undefined;
  initialSource?: AddressSource | undefined;
};

export function AddContactSheet({ open, onClose, onSaved, initialName, initialAddress, initialSource }: AddContactSheetProps) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [source, setSource] = React.useState<AddressSource>("typed");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<{ field: "name" | "address"; text: string }>();

  // Each opening starts from what the caller knows (the name the person said, a scanned or received address), once:
  // later changes to those values (the search text behind the sheet) never overwrite what is being typed.
  const wasOpen = React.useRef(false);
  const nameRef = React.useRef<FieldRef>(null);
  const addressRef = React.useRef<FieldRef>(null);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      setName(initialName ?? "");
      setAddress(initialAddress ?? "");
      setSource(initialSource ?? (initialAddress?.startsWith("@") ? "handle" : "typed"));
      setError(undefined);
    }
    wasOpen.current = open;
  }, [open, initialName, initialAddress, initialSource]);

  // The sheet owns the keyboard while it is up: whatever field behind it had focus lets go, and the first empty
  // field here takes it, so nothing typed lands on the page underneath.
  React.useEffect(() => {
    if (!open) return undefined;
    Keyboard.dismiss();
    const timer = setTimeout(() => (initialName ? addressRef : nameRef).current?.focus(), FOCUS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [open]); // focus only when the sheet opens, not when the caller's suggestions change

  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return;
    setAddress(text);
    setSource("pasted");
    setError(undefined);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const value = address.trim();
      const { contact } = await api.contacts.create({
        displayName: name.trim(),
        address: value,
        source: value.startsWith("@") ? "handle" : source,
      });
      toast(t("contacts.saved", { name: contact.displayName }));
      onSaved(contact);
    } catch (caught) {
      const known = caught instanceof ApiError ? ERRORS[caught.code] : undefined;
      if (known) setError({ field: known.field, text: t(known.key) });
      else toast(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const ready = name.trim().length > 0 && address.trim().length > 0 && !saving;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("contacts.addTitle")}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
    >
      <View className="gap-4">
        <View className="gap-2">
          <Text className={cn("text-muted-foreground text-sm font-semibold", TEXT_START)}>{t("contacts.name")}</Text>
          <SheetInput
            ref={nameRef}
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (error?.field === "name") setError(undefined);
            }}
            placeholder={t("contacts.namePlaceholder")}
            accessibilityLabel={t("contacts.name")}
            maxLength={NAME_MAX}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => addressRef.current?.focus()}
          />
          {error?.field === "name" ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{error.text}</Text> : null}
        </View>

        <View className="gap-2">
          <Text className={cn("text-muted-foreground text-sm font-semibold", TEXT_START)}>{t("contacts.address")}</Text>
          <View className="flex-row items-center gap-2">
            <SheetInput
              ref={addressRef}
              value={address}
              onChangeText={(value) => {
                setAddress(value);
                // Kawase never asks how the address arrived: Paste, a scan or the caller say so, and a hand edit is typed.
                setSource("typed");
                if (error?.field === "address") setError(undefined);
              }}
              placeholder={t("contacts.addressPlaceholder")}
              accessibilityLabel={t("contacts.address")}
              maxLength={ADDRESS_MAX}
              autoCapitalize="none"
              autoCorrect={false}
              // Addresses and handles always read left-to-right.
              style={{ writingDirection: "ltr", textAlign: "left" }}
              className="flex-1 font-mono text-sm"
            />
            <Button variant="secondary" className="h-14 rounded-2xl" onPress={() => void paste()}>
              <Text>{t("contacts.paste")}</Text>
            </Button>
          </View>
          {error?.field === "address" ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{error.text}</Text> : null}
        </View>

        <Button size="lg" disabled={!ready} onPress={() => void save()}>
          <Text>{saving ? t("contacts.saving") : t("contacts.save")}</Text>
        </Button>
      </View>
    </Sheet>
  );
}
