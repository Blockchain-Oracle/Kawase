// Settings → Account (cards/access.md): the sign-in methods on this account (email, Google, Apple — the same Turnkey
// user, so any of them opens the same wallet), changing the email (a code to the new address), and the doors to
// Devices, Export wallet and Delete account.
import { useRouter } from "expo-router";
import { KeyRound, Laptop, Mail, Trash2 } from "lucide-react-native";
import * as React from "react";
import { Platform, View } from "react-native";
import { toast } from "sonner-native";

import { providerKey } from "@kawase/identity";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { type LinkProvider, type SignInMethods } from "@/account/account-methods-core";
import { Page, Section } from "@/account/page";
import { useAccountMethods } from "@/account/use-account-methods";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

const MARK_SIZE = 24;
const CODE_LENGTH = 6;

function EmailChange({ onDone }: { onDone: (email: string | null) => void }) {
  const { t } = useT();
  const account = useAccountMethods();
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [otp, setOtp] = React.useState<{ otpId: string; otpEncryptionTargetBundle: string }>();
  const [busy, setBusy] = React.useState(false);
  const send = async () => {
    setBusy(true);
    try {
      setOtp(await account.sendEmailCode(email));
    } catch (error) {
      toast(/max number of otps/i.test(String((error as Error).message)) ? t("errors.rateLimited") : t("account.codeFailed"));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!otp) return;
    setBusy(true);
    try {
      const result = await account.confirmEmail({ email, code, ...otp });
      toast(t("account.emailChanged"));
      onDone(result.email);
    } catch (error) {
      const message = String((error as { message?: string }).message ?? "");
      toast(/another account|recovery/i.test(message) ? t("account.emailTaken") : t("account.codeWrong"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="bg-card border-border gap-3 rounded-3xl border p-4">
      {!otp ? (
        <>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("account.newEmailBody")}</Text>
          <Input value={email} onChangeText={setEmail} placeholder={t("account.newEmail")} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Button disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} onPress={() => void send()}>
            <Text>{busy ? t("common.loading") : t("account.sendCode")}</Text>
          </Button>
        </>
      ) : (
        <>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("account.codeSent", { email: email.trim() })}</Text>
          <Input value={code} onChangeText={setCode} placeholder="000000" keyboardType="number-pad" textContentType="oneTimeCode" maxLength={CODE_LENGTH} />
          <Button disabled={busy || code.trim().length !== CODE_LENGTH} onPress={() => void confirm()}>
            <Text>{busy ? t("common.loading") : t("account.confirmEmail")}</Text>
          </Button>
        </>
      )}
    </View>
  );
}

export function AccountScreen() {
  const { t } = useT();
  const router = useRouter();
  const { user } = useSession();
  const account = useAccountMethods();
  const [methods, setMethods] = React.useState<SignInMethods>(account.methods);
  const [changing, setChanging] = React.useState(false);
  const [linking, setLinking] = React.useState<LinkProvider>();
  const refresh = account.refresh;
  // Once on opening: the kit's cached user may predate a method linked on another device.
  const opened = React.useRef(false);
  React.useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void refresh().then(setMethods).catch(() => undefined);
  }, [refresh]);

  const link = async (provider: LinkProvider) => {
    setLinking(provider);
    try {
      await account.link(provider);
      setMethods(await account.refresh());
      toast(t("account.linked", { provider: provider === "google" ? "Google" : "Apple" }));
    } catch (error) {
      const message = String((error as { message?: string }).message ?? "");
      // Turnkey refuses an identity that already belongs to another account: say so, and where it signs in.
      toast(/already|associated|another/i.test(message) ? t("account.linkTaken") : t("account.linkFailed"));
    } finally {
      setLinking(undefined);
    }
  };

  const providerRow = (provider: LinkProvider) => {
    const linked = methods[provider];
    return (
      <ListRow
        leading={<Mark entity={providerKey(provider)} size={MARK_SIZE} />}
        title={provider === "google" ? "Google" : "Apple"}
        subtitle={linked ? t("account.linkedLabel") : t("account.notLinked")}
        trailing={linked ? undefined : <Text className="text-primary text-sm font-semibold">{linking === provider ? t("common.loading") : t("account.link")}</Text>}
        {...(linked || linking ? {} : { onPress: () => void link(provider) })}
      />
    );
  };

  return (
    <Page title={t("account.title")}>
      <Section title={t("account.methods")}>
        <ListGroup>
          <ListRow
            leading={<Icon as={Mail} className="text-muted-foreground size-5" />}
            title={t("account.email")}
            subtitle={methods.email ?? user?.email ?? t("account.noEmail")}
            trailing={<Text className="text-primary text-sm font-semibold">{methods.email ? t("account.change") : t("account.add")}</Text>}
            onPress={() => setChanging((open) => !open)}
          />
          {providerRow("google")}
          {/* Sign in with Apple exists on Apple platforms and the web; Android links Apple through the web flow. */}
          {Platform.OS === "ios" || methods.apple ? providerRow("apple") : null}
        </ListGroup>
        {changing ? (
          <EmailChange
            onDone={(email) => {
              setChanging(false);
              setMethods((current) => ({ ...current, email }));
            }}
          />
        ) : null}
        <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("account.methodsBody")}</Text>
      </Section>
      <Section title={t("account.security")}>
        <ListGroup>
          <ListRow leading={<Icon as={Laptop} className="text-muted-foreground size-5" />} title={t("account.devices")} chevron onPress={() => router.push("/account/devices")} />
          <ListRow leading={<Icon as={KeyRound} className="text-muted-foreground size-5" />} title={t("account.export")} chevron onPress={() => router.push("/account/export")} />
          <ListRow leading={<Icon as={Trash2} className="text-destructive size-5" />} title={t("account.delete")} chevron onPress={() => router.push("/account/delete")} />
        </ListGroup>
      </Section>
    </Page>
  );
}
