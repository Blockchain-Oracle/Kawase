// Settings → Sign-in & security (cards/access.md) on the Senryo kit. The ways into this account (the email code,
// Google, Apple: the same Privy user, so any of them opens the same wallet), each one linked or removed in place, and
// the doors to Devices, the private key and deleting the account.
// - The methods are read from the provider's own user (real data), refreshed once on opening; a refresh that fails
//   keeps what was shown and marks it stale.
// - The last way in is never removable (Privy refuses it too); removing asks once in a sheet, never with Face ID.
// - The email is changed, or added to a Google/Apple-only account, with a code sent to the new address; Kawase then
//   follows the verified address.
// - Signed in to Kawase but not to the provider on this device (a session from before the switch to Privy): the
//   methods say so and offer the sign-in that restores them; the doors below keep working.
import { useRouter } from "expo-router";
import { KeyRound, Laptop, Mail, Trash2 } from "lucide-react-native";
import * as React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { providerKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";

import {
  Button,
  EmptyState,
  Icon,
  ListRow,
  LoadingState,
  RADIUS,
  SIZE,
  SPACE,
  StaleTick,
  TYPE,
  useHeldLoading,
  useTheme,
} from "@/components/kit";
import { diagnose } from "@/components/kit/diagnosis";
import { Sheet, useSheetClose } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { notify } from "@/components/toast/notify";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { methodCount, type LinkProvider, type LoginMethod, type SignInMethods } from "./account-methods";
import { CodeField, CODE_LENGTH, Field } from "./fields";
import { Group, GroupNote, Page } from "./kit-page";
import { useAccountMethods } from "./use-account-methods";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_AFTER_S = 30;
const MS_PER_SECOND = 1000;
const PROVIDER_NAME: Record<LinkProvider, string> = { google: "Google", apple: "Apple" };

type Refresh = { state: "idle" | "loading" | "done" } & { failedAt?: number; offline?: boolean };

/** The real marks for Google and Apple (Apple's mark follows the ink, so it reads on dark too). */
function ProviderMark({ provider }: { provider: LinkProvider }) {
  const { color } = useTheme();
  return provider === "apple" ? (
    <Mark entity={providerKey("apple")} size={SIZE.markRow} variant="mono" tint={color.ink} />
  ) : (
    <Mark entity={providerKey("google")} size={SIZE.markRow} />
  );
}

function MethodIcon({ icon }: { icon: typeof Mail }) {
  const { color } = useTheme();
  return (
    <View style={[styles.glyph, { backgroundColor: color.raised2 }]}>
      <Icon icon={icon} size={SIZE.iconSm} tint={color.ink} />
    </View>
  );
}

export function AccountScreen() {
  const { t } = useT();
  const router = useRouter();
  const { user, status } = useSession();
  const signIn = useSignIn();
  const account = useAccountMethods();
  const [methods, setMethods] = React.useState<SignInMethods>(account.methods);
  const [refresh, setRefresh] = React.useState<Refresh>({ state: "idle" });
  const [sheet, setSheet] = React.useState<{ kind: "email" } | { kind: "unlink"; method: LoginMethod }>();
  const [linking, setLinking] = React.useState<LinkProvider>();
  const reload = account.refresh;
  const manageable = account.manageable;

  // The provider's own user changes under us (a link that came back from Google, another device): follow it.
  const { email: knownEmail, google: knownGoogle, apple: knownApple } = account.methods;
  React.useEffect(() => {
    setMethods({ email: knownEmail, google: knownGoogle, apple: knownApple });
  }, [knownEmail, knownGoogle, knownApple]);

  // Once on opening: the cached user may predate a method linked on another device.
  const opened = React.useRef(false);
  React.useEffect(() => {
    if (opened.current || !manageable) return;
    opened.current = true;
    setRefresh({ state: "loading" });
    void reload()
      .then((fresh) => {
        setMethods(fresh);
        setRefresh({ state: "done" });
      })
      .catch((error: unknown) =>
        setRefresh({ state: "done", failedAt: Date.now(), offline: diagnose(error).kind === "offline" }),
      );
  }, [reload, manageable]);
  const firstLoad = useHeldLoading(refresh.state === "loading" && methodCount(methods) === 0);

  const link = async (provider: LinkProvider) => {
    setLinking(provider);
    try {
      await account.link(provider);
      setMethods(await account.refresh());
      notify.success(t("account.linked", { provider: PROVIDER_NAME[provider] }));
    } catch (error) {
      const message = String((error as { message?: string }).message ?? "");
      if (diagnose(error).kind === "rejected" || /cancel/i.test(message)) return;
      // An identity that already belongs to another account: say so, and where it signs in.
      notify.error(
        /already|associated|another|linked to/i.test(message) ? t("account.linkTaken") : t("account.linkFailed"),
      );
    } finally {
      setLinking(undefined);
    }
  };

  if (status === "guest" || !user || user.isGuest) {
    return (
      <Page title={t("account.title")}>
        <EmptyState
          size="page"
          why={t("account.guestTitle")}
          detail={t("account.guestDetail")}
          action={{ label: t("signIn.title"), onPress: signIn.open }}
        />
      </Page>
    );
  }

  const providerRow = (provider: LinkProvider) => {
    const linked = methods[provider];
    const removable = account.removable(methods, provider);
    return (
      <ListRow
        key={provider}
        leading={<ProviderMark provider={provider} />}
        title={PROVIDER_NAME[provider]}
        detail={linked ? (removable ? t("account.linkedLabel") : t("account.onlyWayIn")) : t("account.notLinked")}
        trailing={
          linked ? (
            removable ? (
              <Button
                label={t("account.remove")}
                size="sm"
                variant="ghost"
                block={false}
                onPress={() => setSheet({ kind: "unlink", method: provider })}
              />
            ) : undefined
          ) : (
            <Button
              label={t("account.link")}
              size="sm"
              variant="secondary"
              block={false}
              loading={linking === provider}
              disabled={Boolean(linking) || !manageable}
              onPress={() => void link(provider)}
            />
          )
        }
      />
    );
  };

  const emailRemovable = account.removable(methods, "email");
  // Sign in with Apple exists on Apple platforms and the web; elsewhere a linked Apple login still shows.
  const appleShown = Platform.OS !== "android" || methods.apple;

  return (
    <Page title={t("account.title")}>
      <View style={styles.block}>
        <Group label={t("account.methods")}>
          {firstLoad ? (
            <View style={styles.inset}>
              <LoadingState shape="list" label={t("account.loadingMethods")} />
            </View>
          ) : !manageable ? (
            <EmptyState
              size="inline"
              why={t("account.reconnectTitle")}
              detail={t("account.reconnectDetail")}
              action={{ label: t("signIn.title"), onPress: signIn.open }}
            />
          ) : (
            <>
              <ListRow
                leading={<MethodIcon icon={Mail} />}
                title={t("account.email")}
                detail={methods.email ?? t("account.noEmail")}
                trailing={
                  <View style={styles.actions}>
                    {emailRemovable ? (
                      <Button
                        label={t("account.remove")}
                        size="sm"
                        variant="ghost"
                        block={false}
                        onPress={() => setSheet({ kind: "unlink", method: "email" })}
                      />
                    ) : null}
                    <Button
                      label={methods.email ? t("account.change") : t("account.add")}
                      size="sm"
                      variant="secondary"
                      block={false}
                      onPress={() => setSheet({ kind: "email" })}
                    />
                  </View>
                }
              />
              {providerRow("google")}
              {appleShown ? providerRow("apple") : null}
            </>
          )}
        </Group>
        {refresh.failedAt ? (
          <StaleTick asOf={refresh.failedAt} reason={refresh.offline ? "offline" : "refresh-failed"} />
        ) : null}
        {manageable ? <GroupNote>{t("account.methodsBody")}</GroupNote> : null}
      </View>

      <Group label={t("account.security")}>
        <ListRow
          leading={<MethodIcon icon={Laptop} />}
          title={t("account.devices")}
          onPress={() => router.push("/account/devices")}
        />
        <ListRow
          leading={<MethodIcon icon={KeyRound} />}
          title={t("account.export")}
          onPress={() => router.push("/account/export")}
        />
        <ListRow leading={<DangerIcon />} title={t("account.delete")} onPress={() => router.push("/account/delete")} />
      </Group>

      {sheet?.kind === "email" ? (
        <EmailSheet
          adding={!methods.email}
          onClose={() => setSheet(undefined)}
          onDone={(email) => setMethods((current) => ({ ...current, email: email ?? current.email }))}
        />
      ) : null}
      {sheet?.kind === "unlink" ? (
        <UnlinkSheet
          method={sheet.method}
          email={methods.email}
          onClose={() => setSheet(undefined)}
          onDone={() =>
            void account
              .refresh()
              .then(setMethods)
              .catch(() =>
                setMethods((current) =>
                  sheet.method === "email" ? { ...current, email: null } : { ...current, [sheet.method]: false },
                ),
              )
          }
        />
      ) : null}
    </Page>
  );
}

function DangerIcon() {
  const { color } = useTheme();
  return (
    <View style={[styles.glyph, { backgroundColor: color.destructiveWash }]}>
      <Icon icon={Trash2} size={SIZE.iconSm} tint={color.destructive} />
    </View>
  );
}

/** Removing a way in: one sheet, one destructive action, nothing else (D38: no Face ID to lower what is possible). */
function UnlinkSheet({
  method,
  email,
  onClose,
  onDone,
}: {
  method: LoginMethod;
  email: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const name = method === "email" ? (email ?? t("account.email")) : PROVIDER_NAME[method];
  return (
    <Sheet
      onClose={onClose}
      closeLabel={t("shell.kit.closeNamed", { name: t("account.unlinkTitle", { method: name }) })}
    >
      <SheetHeading
        title={t("account.unlinkTitle", { method: name })}
        body={t("account.unlinkBody", { method: name })}
      />
      <UnlinkActions method={method} name={name} onDone={onDone} />
    </Sheet>
  );
}

function UnlinkActions({ method, name, onDone }: { method: LoginMethod; name: string; onDone: () => void }) {
  const { t } = useT();
  const close = useSheetClose();
  const account = useAccountMethods();
  const [busy, setBusy] = React.useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await account.unlink(method);
      notify.success(t("account.unlinked", { method: name }));
      close(onDone);
    } catch {
      notify.error(t("account.unlinkFailed"));
      setBusy(false);
    }
  };
  return (
    <View style={styles.sheetActions}>
      <Button label={t("account.remove")} variant="destructive" loading={busy} onPress={() => void remove()} />
      <Button label={t("common.cancel")} variant="ghost" disabled={busy} onPress={() => close()} />
    </View>
  );
}

/** Change (or add) the email: the new address, then the six-digit code sent to it, verified the moment it is typed. */
function EmailSheet({
  adding,
  onClose,
  onDone,
}: {
  adding: boolean;
  onClose: () => void;
  onDone: (email: string | null) => void;
}) {
  const { t } = useT();
  const title = adding ? t("account.addEmailTitle") : t("account.changeEmailTitle");
  return (
    <Sheet onClose={onClose} closeLabel={t("shell.kit.closeNamed", { name: title })}>
      <EmailSteps title={title} onDone={onDone} />
    </Sheet>
  );
}

function EmailSteps({ title, onDone }: { title: string; onDone: (email: string | null) => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const close = useSheetClose();
  const account = useAccountMethods();
  const [email, setEmail] = React.useState("");
  const [sentTo, setSentTo] = React.useState<string>();
  const [sentAt, setSentAt] = React.useState(0);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState<"send" | "verify">();
  const [error, setError] = React.useState<string>();
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (!sentTo) return undefined;
    const timer = setInterval(() => setNow(Date.now()), MS_PER_SECOND);
    return () => clearInterval(timer);
  }, [sentTo]);
  const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - sentAt) / MS_PER_SECOND));

  const send = async (address: string) => {
    setBusy("send");
    setError(undefined);
    try {
      await account.sendEmailCode(address);
      setSentTo(address);
      setSentAt(Date.now());
      setNow(Date.now());
      setCode("");
    } catch (failure) {
      const message = String((failure as Error).message ?? "");
      setError(
        /too many|too_many_requests|rate/i.test(message)
          ? t("errors.rateLimited")
          : diagnose(failure).kind === "offline"
            ? t("errors.offlineAction")
            : t("account.codeFailed"),
      );
    } finally {
      setBusy(undefined);
    }
  };

  const verify = async (digits: string) => {
    if (!sentTo) return;
    setBusy("verify");
    setError(undefined);
    try {
      const result = await account.confirmEmail({ email: sentTo, code: digits });
      notify.success(t("account.emailChanged"));
      close(() => onDone(result.email));
    } catch (failure) {
      const message = String((failure as { message?: string }).message ?? "");
      setError(/another account|recovery|already/i.test(message) ? t("account.emailTaken") : t("account.codeWrong"));
      setCode("");
      setBusy(undefined);
    }
  };

  const valid = EMAIL_PATTERN.test(email.trim());
  return (
    <>
      <SheetHeading
        title={title}
        body={sentTo ? t("account.codeSent", { email: sentTo }) : t("account.newEmailBody")}
      />
      <View style={styles.sheetActions}>
        {sentTo ? (
          <CodeField
            value={code}
            onChange={setCode}
            onFilled={(digits) => void verify(digits)}
            label={t("signIn.code")}
            invalid={Boolean(error)}
            disabled={busy === "verify"}
          />
        ) : (
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder={t("account.newEmail")}
            accessibilityLabel={t("account.newEmail")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={() => valid && void send(email.trim())}
          />
        )}
        {error ? (
          <Text accessibilityRole="alert" style={[TYPE.rowDetail, styles.center, { color: color.destructive }]}>
            {error}
          </Text>
        ) : null}
        {sentTo ? (
          <>
            <Button
              label={t("account.confirmEmail")}
              loading={busy === "verify"}
              disabled={code.length !== CODE_LENGTH}
              onPress={() => void verify(code)}
            />
            <Button
              label={wait > 0 ? t("account.resendIn", { seconds: String(wait) }) : t("account.resend")}
              variant="ghost"
              disabled={wait > 0 || Boolean(busy)}
              onPress={() => void send(sentTo)}
            />
          </>
        ) : (
          <Button
            label={valid ? t("account.sendCode") : t("account.enterEmail")}
            loading={busy === "send"}
            disabled={!valid}
            onPress={() => void send(email.trim())}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACE.sm },
  inset: { padding: SPACE.lg },
  glyph: {
    width: SIZE.markRow,
    height: SIZE.markRow,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  sheetActions: { gap: SPACE.md, paddingTop: SPACE.md },
  center: { textAlign: "center" },
});
