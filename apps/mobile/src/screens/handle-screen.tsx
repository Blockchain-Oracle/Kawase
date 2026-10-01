// The @handle step (journey 3): optional, asked once per account after sign-in and before wallet setup, and reachable
// again from Settings. The rules are checked as the user types (shared with the api in @kawase/config), then the api
// says whether someone has it; Continue saves it, Skip is always there. Either answer is recorded on the account, so
// a returning account that skipped is never asked again at sign-in (Codex review R07). In edit mode both go back
// to Settings.
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "@kawase/api-client";
import { HANDLE_CHECK_DEBOUNCE_MS, HANDLE_MAX, handleProblem, normalizeHandle } from "@kawase/config";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { HandleField, type HandleFieldState } from "@kawase/ui-native/components/handle-field";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { OnboardingBar } from "@/components/onboarding-bar";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const EDGE_INSET = 12;
const FOOTER_GAP = 16;
const HINT_PATTERN = /[^a-z0-9_]/g;
const KOBAN_WIDTH = 72;
/** The onboarding steps after sign-in: handle · wallet · allowance. */
const ONBOARDING_STEPS = 3;

type Check = { state: HandleFieldState; reason?: "too_short" | "too_long" | "invalid" | "reserved" | "taken" | "error" };

export function HandleScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, user, update } = useSession();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit !== undefined;
  const [value, setValue] = React.useState(user?.handle ?? "");
  const [check, setCheck] = React.useState<Check>({ state: "idle" });
  const [saving, setSaving] = React.useState(false);

  const handle = normalizeHandle(value);
  const unchanged = handle === (user?.handle ?? "");

  // The local rules answer at once; the api is asked only for a handle that passes them, after a pause in typing.
  React.useEffect(() => {
    if (handle.length === 0 || unchanged) {
      setCheck({ state: "idle" });
      return;
    }
    const reason = handleProblem(handle);
    if (reason) {
      setCheck({ state: "problem", reason });
      return;
    }
    setCheck({ state: "checking" });
    let stale = false;
    const timer = setTimeout(() => {
      api.me
        .handleAvailability(handle)
        .then((result) => {
          if (stale) return;
          setCheck(result.available ? { state: "available" } : { state: "problem", reason: result.reason });
        })
        .catch(() => {
          if (!stale) setCheck({ state: "problem", reason: "error" });
        });
    }, HANDLE_CHECK_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [handle, unchanged]);

  if (status !== "account") return <Redirect href="/" />;
  // Asked once per account: an answered step (a handle saved or skipped) goes straight on, unless it came to edit.
  if (!editing && (user?.handlePrompted || user?.handle) && unchanged && !saving) return <Redirect href="/wallet" />;

  const leave = () => (editing ? router.back() : router.replace("/wallet"));
  // Skip is an answer too: remembered on the account. If that cannot be saved now, the step simply asks again later.
  const skip = async () => {
    if (editing) return leave();
    setSaving(true);
    await update({ handlePrompted: true }).catch(() => undefined);
    leave();
  };

  const messages: Record<NonNullable<Check["reason"]>, string> = {
    too_short: t("handle.tooShort"),
    too_long: t("handle.tooLong"),
    invalid: t("handle.invalid"),
    reserved: t("handle.reserved"),
    taken: t("handle.taken"),
    error: t("common.error"),
  };
  const message = check.state === "checking" ? t("handle.checking") : check.state === "available" ? t("handle.available") : check.reason ? messages[check.reason] : undefined;

  const save = async () => {
    setSaving(true);
    try {
      await update({ handle });
      leave();
    } catch (failure) {
      // Someone took it between the check and the save, or the rules changed under us: say which.
      const code = failure instanceof ApiError ? failure.code : undefined;
      setCheck({ state: "problem", reason: code === "handle_taken" ? "taken" : code === "handle_reserved" ? "reserved" : code === "handle_invalid" ? "invalid" : "error" });
      setSaving(false);
    }
  };

  const hint = user?.email?.split("@")[0]?.toLowerCase().replace(HINT_PATTERN, "").slice(0, HANDLE_MAX) || t("handle.placeholder");

  return (
    <View className="bg-background flex-1">
      <View className="flex-1 gap-6 px-5" style={{ paddingTop: insets.top + EDGE_INSET }}>
        <OnboardingBar leading={editing ? { kind: "back", onPress: () => router.back() } : undefined} step={editing ? undefined : { index: 0, total: ONBOARDING_STEPS }} />
        <Koban width={KOBAN_WIDTH} id="handle-koban" rotate={-10} />
        <View className="gap-2">
          <Text className={cn("font-display text-foreground text-3xl font-bold", TEXT_START)}>{t("handle.title")}</Text>
          <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{t("handle.subtitle")}</Text>
        </View>
        <HandleField
          value={value}
          onChangeText={(next) => setValue(normalizeHandle(next))}
          state={check.state}
          message={message}
          placeholder={hint}
          clearLabel={t("handle.clear")}
          label={t("handle.row")}
          maxLength={HANDLE_MAX}
          autoFocus
          onSubmit={() => (check.state === "available" ? void save() : undefined)}
        />
      </View>
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View className="gap-2 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <Button size="lg" disabled={check.state !== "available" || saving} onPress={() => void save()}>
            <Text>{t("common.continue")}</Text>
          </Button>
          <Button variant="ghost" disabled={saving} onPress={() => void skip()}>
            <Text className="text-muted-foreground">{editing ? t("common.cancel") : t("handle.skip")}</Text>
          </Button>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
