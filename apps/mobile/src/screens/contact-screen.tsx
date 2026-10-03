// One contact (revamp 10c; I1, I4): who they are, the address money goes to now (in full, mono, left-to-right,
// copyable), Verify (scan their QR, or confirm it together), Send, and the address history — every version with its
// status (current, active from a time, old), where it came from (the same words as the send screen's trust chip), and
// per this network when it was last paid and how it was verified. Changing the address puts the new one on a 24 h hold
// during which payments to the contact are frozen; the banner says until when and lets the person cancel the change.
// Notes are the person's own (saved when the field loses focus). Removing a contact is hold-to-confirm, because it
// cannot be undone and is not a payment (DESIGN.md).
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { BadgeCheck, Clock, Copy, ScanLine, Send } from "lucide-react-native";
import * as React from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { ApiError, type Contact, type ContactAddress, type VerifyMethod } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { Amount } from "@kawase/ui-native/components/amount";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { HoldToConfirm } from "@kawase/ui-native/components/hold-to-confirm";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Sheet, SheetInput } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { Textarea } from "@kawase/ui-native/components/ui/textarea";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { ContactsHeader } from "@/contacts/screen-header";
import { contactAddress, useContact, useSourceLabel } from "@/contacts/use-contacts";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { ScanModal } from "@/scan/scan-modal";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

const AVATAR = 72;
const CHAIN_MARK = 24;
const ART_WIDTH = 160;
const BOTTOM_GAP = 16;
const ADDRESS_MAX = 80;
const NOTES_MAX = 500;
const NOTES_LINES = 4;
const SKELETON_NAME = 160;
const SKELETON_ADDRESS = 240;
const SKELETON_BLOCK = 96;

const ADDRESS_ERRORS: Record<string, string> = {
  address_invalid: "contacts.invalidAddress",
  recipient_unknown: "contacts.unknownHandle",
  recipient_no_wallet: "contacts.noWallet",
  recipient_is_self: "contacts.self",
  validation: "contacts.invalidAddress",
};

function useFormatters() {
  const { locale } = useLocale();
  return {
    time: (iso: string) => new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)),
    date: (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso)),
  };
}

/** How a verification is named: the method the person chose, in their language (older free-text ones as they are). */
function useVerifiedLabel() {
  const { t } = useT();
  return (method: string) => (method === "qr" ? t("contacts.verifiedQr") : method === "in_person" ? t("contacts.verifiedInPerson") : method === "call" ? t("contacts.verifiedCall") : method);
}

/** The first address a scanned code carries for a person: an EIP-681 transfer's recipient, else the first 0x address. */
function scannedAddress(code: string): string | undefined {
  return (/[?&]address=(0x[0-9a-fA-F]{40})/.exec(code) ?? /(0x[0-9a-fA-F]{40})/.exec(code))?.[1];
}

/**
 * Verify (capability matrix, Counterparts): check once that the current address is really theirs — scan the QR on
 * their phone (it must show this exact address), or confirm it together in person or on a call. Per network; a new
 * address starts unverified. Only the person sets it, here.
 */
function VerifyAddress({ contact, network, onChanged }: { contact: Contact; network: "mainnet" | "testnet"; onChanged: (contact: Contact) => void }) {
  const { t } = useT();
  const verifiedLabel = useVerifiedLabel();
  const [scanning, setScanning] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const current = contact.addresses.find((entry) => entry.status === "active");
  const method = current?.trust[network]?.verifiedMethod ?? null;
  if (!current || contact.pendingChange) return null;

  const save = async (next: VerifyMethod | null) => {
    setBusy(true);
    try {
      onChanged((await api.contacts.verify(contact.id, next)).contact);
      if (next) toast(t("contacts.verifyDone"));
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };
  const scanned = (code: string) => {
    setScanning(false);
    const found = scannedAddress(code);
    if (found && found.toLowerCase() === current.address.toLowerCase()) void save("qr");
    else toast(t("contacts.verifyMismatch"));
    return true;
  };

  return (
    <View className="bg-card border-border gap-3 rounded-2xl border p-4">
      {method ? (
        <View className="flex-row items-center gap-2">
          <Icon as={BadgeCheck} className="text-success size-5" />
          <Text className={cn("text-foreground flex-1 text-sm font-semibold", TEXT_START)}>{t("contacts.verified", { method: verifiedLabel(method) })}</Text>
          <Button variant="ghost" size="sm" disabled={busy} onPress={() => void save(null)}>
            <Text className="text-muted-foreground">{t("contacts.unverify")}</Text>
          </Button>
        </View>
      ) : (
        <>
          <View className="gap-1">
            <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("contacts.verifyTitle")}</Text>
            <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("contacts.verifyBody")}</Text>
          </View>
          {Platform.OS !== "web" ? (
            <Button variant="secondary" disabled={busy} onPress={() => setScanning(true)}>
              <Icon as={ScanLine} className="size-4" />
              <Text>{t("contacts.verifyScan")}</Text>
            </Button>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onPress={() => void save("in_person")}>
              <Text className="text-muted-foreground">{t("contacts.verifyInPerson")}</Text>
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onPress={() => void save("call")}>
              <Text className="text-muted-foreground">{t("contacts.verifyCall")}</Text>
            </Button>
          </View>
        </>
      )}
      <ScanModal open={scanning} origin="contact" onClose={() => setScanning(false)} onCode={scanned} />
    </View>
  );
}

function AddressVersion({ address, network }: { address: ContactAddress; network: "mainnet" | "testnet" }) {
  const { t } = useT();
  const verifiedLabel = useVerifiedLabel();
  const source = useSourceLabel();
  const { time, date } = useFormatters();
  const trust = address.trust[network];
  const networkName = network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const status =
    address.status === "active"
      ? t("contacts.current")
      : address.status === "pending_cooldown" && address.activatesAt
        ? t("contacts.pending", { time: time(address.activatesAt) })
        : t("contacts.retired");
  const current = address.status === "active";
  const pending = address.status === "pending_cooldown";
  return (
    <View className="gap-1.5 px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Amount numberOfLines={1} className={cn("shrink text-sm", current ? "text-foreground" : "text-muted-foreground")}>
          {address.address}
        </Amount>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <View className={cn("flex-row items-center gap-1 rounded-full px-2 py-0.5", current ? "bg-success/15" : "bg-muted")}>
          {pending ? <Icon as={Clock} className="text-foreground size-3" /> : null}
          <Text className={cn("text-xs font-semibold", current ? "text-success" : "text-muted-foreground")}>{status}</Text>
        </View>
        <Text className="text-muted-foreground text-xs">{source(address.source)}</Text>
      </View>
      {address.status !== "retired" ? (
        <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
          {trust?.lastPaidAt ? t("contacts.lastPaid", { date: date(trust.lastPaidAt), network: networkName }) : t("contacts.neverPaid")}
          {trust?.verifiedMethod ? ` · ${t("contacts.verified", { method: verifiedLabel(trust.verifiedMethod) })}` : ""}
        </Text>
      ) : null}
    </View>
  );
}

function ChangeAddressSheet({ contact, open, onClose, onChanged }: { contact: Contact; open: boolean; onClose: () => void; onChanged: (contact: Contact) => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [value, setValue] = React.useState("");
  const [pasted, setPasted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (!open) return;
    setValue("");
    setPasted(false);
    setError(undefined);
  }, [open]);

  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return;
    setValue(text);
    setPasted(true);
    setError(undefined);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const address = value.trim();
      const { contact: changed } = await api.contacts.changeAddress(contact.id, {
        address,
        source: address.startsWith("@") ? "handle" : pasted ? "pasted" : "typed",
      });
      toast(t("contacts.changeRequested"));
      onChanged(changed);
    } catch (caught) {
      const key = caught instanceof ApiError ? ADDRESS_ERRORS[caught.code] : undefined;
      if (key) setError(t(key));
      else toast(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("contacts.changeTitle", { name: contact.displayName })}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
    >
      <View className="gap-4">
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <SheetInput
              value={value}
              onChangeText={(next) => {
                setValue(next);
                setPasted(false);
                setError(undefined);
              }}
              placeholder={t("contacts.addressPlaceholder")}
              accessibilityLabel={t("contacts.address")}
              maxLength={ADDRESS_MAX}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ writingDirection: "ltr", textAlign: "left" }}
              className="flex-1 font-mono text-sm"
            />
            <Button variant="secondary" className="h-14 rounded-2xl" onPress={() => void paste()}>
              <Text>{t("contacts.paste")}</Text>
            </Button>
          </View>
          {error ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{error}</Text> : null}
        </View>
        <View className="bg-muted flex-row items-start gap-2 rounded-2xl px-4 py-3">
          <Icon as={Clock} className="text-foreground mt-0.5 size-4" />
          <Text className={cn("text-foreground flex-1 text-sm leading-5", TEXT_START)}>{t("contacts.changeNote", { name: contact.displayName })}</Text>
        </View>
        <Button size="lg" disabled={!value.trim() || saving} onPress={() => void save()}>
          <Text>{saving ? t("contacts.saving") : t("contacts.save")}</Text>
        </Button>
      </View>
    </Sheet>
  );
}

function DetailSkeleton() {
  return (
    <View className="gap-5 px-5 pt-6">
      <View className="items-center gap-3">
        <Skeleton className="rounded-full" style={{ width: AVATAR, height: AVATAR }} />
        <Skeleton className="h-5 rounded-md" style={{ width: SKELETON_NAME }} />
      </View>
      <Skeleton className="h-4 self-center rounded-md" style={{ width: SKELETON_ADDRESS }} />
      <Skeleton className="rounded-2xl" style={{ height: SKELETON_BLOCK }} />
    </View>
  );
}

export function ContactScreen({ id }: { id: string | undefined }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { status: load, contact, refresh, set } = useContact(id);
  const { time } = useFormatters();
  const [changing, setChanging] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  /** Bumped when a delete fails, so the hold control becomes usable again. */
  const [deleteAttempt, setDeleteAttempt] = React.useState(0);
  const [notes, setNotes] = React.useState("");
  const network = user?.activeNetwork ?? "testnet";
  const ids = arcIdentity(network);

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  React.useEffect(() => {
    setNotes(contact?.notes ?? "");
  }, [contact?.id, contact?.notes]);

  const copy = async () => {
    const address = contact?.address;
    if (!address) return;
    await Clipboard.setStringAsync(address);
    toast(t("home.addressCopied"));
  };

  const saveNotes = async () => {
    if (!contact || (contact.notes ?? "") === notes) return;
    try {
      const { contact: saved } = await api.contacts.update(contact.id, { notes: notes.trim() ? notes : null });
      set(saved);
    } catch {
      toast(t("common.error"));
    }
  };

  const cancelChange = async () => {
    if (!contact) return;
    setCancelling(true);
    try {
      const { contact: saved } = await api.contacts.cancelChange(contact.id);
      set(saved);
      toast(t("contacts.changeCancelled"));
    } catch {
      toast(t("common.error"));
    } finally {
      setCancelling(false);
    }
  };

  const remove = async () => {
    if (!contact) return;
    setDeleting(true);
    try {
      await api.contacts.remove(contact.id);
      toast(t("contacts.deleted"));
      router.back();
    } catch {
      toast(t("common.error"));
      setDeleting(false);
      setDeleteAttempt((count) => count + 1);
    }
  };

  if (status !== "account") {
    return (
      <View className="bg-background flex-1">
        <ContactsHeader title={t("contacts.title")} />
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
      </View>
    );
  }

  if (!contact) {
    return (
      <View className="bg-background flex-1">
        <ContactsHeader title={t("contacts.title")} />
        {load === "error" || !id ? (
          <EmptyState
            art={<Koban width={ART_WIDTH} />}
            title={t("contacts.loadFailed")}
            action={
              <Button variant="secondary" onPress={() => void refresh()}>
                <Text>{t("common.retry")}</Text>
              </Button>
            }
          />
        ) : (
          <DetailSkeleton />
        )}
      </View>
    );
  }

  const address = contactAddress(contact);
  const versions = [...contact.addresses].sort((a, b) => b.version - a.version);

  return (
    <View className="bg-background flex-1">
      <ContactsHeader title={contact.displayName} />
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-6 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_GAP }}
      >
        <View className="items-center gap-2">
          <DefaultAvatar seed={(address ?? contact.displayName).toLowerCase()} size={AVATAR} label={contact.displayName} />
          <Text accessibilityRole="header" className="font-display text-foreground text-center text-3xl font-bold">
            {contact.displayName}
          </Text>
          <View className="flex-row flex-wrap items-center justify-center gap-2">
            {contact.handle ? <Amount className="text-muted-foreground text-base">{t("contacts.fromHandle", { handle: contact.handle })}</Amount> : null}
            {contact.kind === "business" ? (
              <View className="bg-muted rounded-full px-2.5 py-1">
                <Text className="text-muted-foreground text-xs font-semibold">{t("contacts.business")}</Text>
              </View>
            ) : null}
            {contact.label ? (
              <View className="bg-muted rounded-full px-2.5 py-1">
                <Text className="text-muted-foreground text-xs font-semibold">{contact.label}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {contact.pendingChange ? (
          <View accessibilityRole="alert" className="bg-muted gap-3 rounded-2xl px-4 py-3">
            <View className="flex-row items-start gap-2">
              <Icon as={Clock} className="text-foreground mt-0.5 size-4" />
              <Text className={cn("text-foreground flex-1 text-sm leading-5", TEXT_START)}>
                {t("contacts.onHoldBanner", { time: time(contact.pendingChange.activatesAt) })}
              </Text>
            </View>
            <Button variant="secondary" size="sm" disabled={cancelling} onPress={() => void cancelChange()}>
              <Text>{t("contacts.cancelChange")}</Text>
            </Button>
          </View>
        ) : null}

        {contact.address ? (
          <View className="bg-card border-border gap-3 rounded-2xl border p-4">
            <View className="flex-row items-center gap-2">
              <Mark entity={ids.chain} size={CHAIN_MARK} />
              <Text className="text-muted-foreground text-sm">{network === "testnet" ? t("network.arcTestnet") : t("network.arc")}</Text>
            </View>
            <Amount selectable className="text-foreground text-base leading-6">
              {contact.address}
            </Amount>
            <Button variant="secondary" size="sm" onPress={() => void copy()}>
              <Icon as={Copy} className="size-4" />
              <Text>{t("home.copyAddress")}</Text>
            </Button>
          </View>
        ) : null}

        <VerifyAddress contact={contact} network={network} onChanged={set} />

        <View className="gap-2">
          <Button
            size="lg"
            disabled={Boolean(contact.pendingChange)}
            onPress={() => router.push({ pathname: "/send", params: { to: contact.displayName } })}
          >
            <Icon as={Send} className="text-primary-foreground size-5" />
            <Text>{contact.pendingChange ? t("send.onHold") : t("contacts.send")}</Text>
          </Button>
          <Button variant="secondary" onPress={() => setChanging(true)}>
            <Text>{t("contacts.changeAddress")}</Text>
          </Button>
        </View>

        <ListGroup label={t("contacts.addresses")}>
          {versions.map((version) => (
            <AddressVersion key={version.id} address={version} network={network} />
          ))}
        </ListGroup>

        <View className="gap-2">
          <Text className={cn("text-muted-foreground px-1 text-xs font-semibold uppercase", TEXT_START)}>{t("contacts.notes")}</Text>
          <Textarea
            value={notes}
            onChangeText={setNotes}
            onBlur={() => void saveNotes()}
            placeholder={t("contacts.notesPlaceholder")}
            accessibilityLabel={t("contacts.notes")}
            maxLength={NOTES_MAX}
            numberOfLines={NOTES_LINES}
          />
        </View>

        <HoldToConfirm onConfirm={() => void remove()} confirmLabel={t("contacts.deleting")} done={false} resetKey={deleteAttempt} disabled={deleting} hint={t("limits.holdHint")}>
          {t("contacts.holdToDelete")}
        </HoldToConfirm>
      </ScrollView>
      <ChangeAddressSheet
        contact={contact}
        open={changing}
        onClose={() => setChanging(false)}
        onChanged={(saved) => {
          setChanging(false);
          set(saved);
        }}
      />
    </View>
  );
}
