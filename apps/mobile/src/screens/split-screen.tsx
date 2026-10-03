// Split a bill (plan §A.4.4, C3): what it was for, the whole bill in any token (R1, the universal asset picker), who
// shares it (contacts as quick chips, or any name / @handle typed), equal or by hand, and whether the person keeps a
// share. Creating it makes one payment request per person (each has its own link; someone on Kawase is also asked in
// the app) and opens the split's progress page. "Your splits" lists the earlier ones. Without an account or a wallet
// there is nothing to be paid into, so it says what to do instead.
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronDown, Plus, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { toast } from "sonner-native";

import { ApiError, type SplitView } from "@kawase/api-client";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { useContacts } from "@/contacts/use-contacts";
import { useT } from "@/i18n";
import { AssetPickerSheet } from "@/portfolio/asset-picker-sheet";
import { assetParam, stableToken, unitsFromCanonical, type TicketToken } from "@/portfolio/ticket-token";
import { useMoney } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const NUMBER = /^\d*(\.\d*)?$/;
const PEOPLE_MAX = 20;
const CHIPS = 8;
const CHIP_MARK = 22;
const ZERO = 0n;

type Person = { name: string; amount: string };

export function SplitScreen() {
  const { t } = useT();
  const router = useRouter();
  const money = useMoney();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { wallet } = useWalletStatus();
  const { contacts, refresh } = useContacts();
  const network = user?.activeNetwork ?? "testnet";
  const [title, setTitle] = React.useState("");
  const [total, setTotal] = React.useState("");
  // Any token on this Arc network (R1): USDC unless the person picks another.
  const [token, setToken] = React.useState<TicketToken>(() => stableToken(network, "USDC"));
  const [picking, setPicking] = React.useState(false);
  React.useEffect(() => setToken((current) => (current.symbol === "USDC" || current.symbol === "EURC" ? stableToken(network, current.symbol) : stableToken(network, "USDC"))), [network]);
  const asset = token.symbol;
  /** A decimal in the token's own decimals as base units, or undefined when it is not a number yet. */
  const toBase = (text: string) => (text ? unitsFromCanonical(text, token.decimals) : undefined);
  const amountOk = (text: string) => text === "" || (NUMBER.test(text) && (text.split(".")[1]?.length ?? 0) <= token.decimals);
  const [mode, setMode] = React.useState<"equal" | "custom">("equal");
  const [includeMe, setIncludeMe] = React.useState(true);
  const [people, setPeople] = React.useState<Person[]>([]);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [earlier, setEarlier] = React.useState<SplitView[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
      if (status === "account") void api.splits.list().then(({ splits }) => setEarlier(splits)).catch(() => undefined);
    }, [refresh, status]),
  );

  const add = (name: string) => {
    const clean = name.trim();
    if (!clean || people.length >= PEOPLE_MAX || people.some((person) => person.name.toLowerCase() === clean.toLowerCase())) return;
    setPeople((current) => [...current, { name: clean, amount: "" }]);
    setTyped("");
  };

  const totalBase = toBase(total);
  const parts = BigInt(people.length + (includeMe ? 1 : 0));
  const each = totalBase && parts > ZERO ? totalBase / parts : undefined;
  const custom = people.map((person) => toBase(person.amount));
  const customSum = custom.reduce<bigint>((sum, value) => sum + (value ?? ZERO), ZERO);
  const ready =
    title.trim().length > 0 &&
    totalBase !== undefined &&
    totalBase > ZERO &&
    people.length > 0 &&
    (mode === "equal" ? (each ?? ZERO) > ZERO : custom.every((value) => value !== undefined && value > ZERO) && (includeMe ? customSum <= totalBase : customSum === totalBase));

  const create = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const { split } = await api.splits.create({
        title: title.trim(),
        asset: assetParam(token),
        total,
        includeMe,
        people: people.map((person) => (mode === "custom" ? { name: person.name, amount: person.amount } : { name: person.name })),
      });
      router.replace({ pathname: "/split/[id]", params: { id: split.id } });
    } catch (error) {
      toast(error instanceof ApiError && error.problem.detail ? error.problem.detail : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  if (status !== "account" || !wallet?.address) {
    const account = status === "account";
    return (
      <Page title={t("split.title")}>
        <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{account ? t("receive.setUpFirstBody") : t("request.signInBody")}</Text>
        <Button onPress={() => (account ? router.push("/wallet") : signIn.open())}>
          <Text>{account ? t("wallet.setUp") : t("signIn.title")}</Text>
        </Button>
      </Page>
    );
  }

  const suggestions = contacts.filter((contact) => !people.some((person) => person.name === contact.displayName)).slice(0, CHIPS);
  return (
    <Page title={t("split.title")}>
      <Section title={t("split.whatFor")}>
        <Input value={title} onChangeText={setTitle} placeholder={t("split.titlePlaceholder")} accessibilityLabel={t("split.whatFor")} maxLength={60} />
        <View className="flex-row items-center gap-2">
          <Input
            value={total}
            onChangeText={(text) => (amountOk(text) ? setTotal(text) : undefined)}
            placeholder="0.00"
            keyboardType="decimal-pad"
            accessibilityLabel={t("split.total")}
            className="flex-1 font-mono"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("split.currency")}: ${token.name}`}
            onPress={() => setPicking(true)}
            className="border-border bg-secondary active:bg-muted h-12 flex-row items-center gap-2 rounded-full border pe-3 ps-2"
          >
            <TokenMark token={token} size={CHIP_MARK} />
            <Text className="text-foreground text-base font-semibold">{asset}</Text>
            <Icon as={ChevronDown} className="text-muted-foreground size-4" />
          </Pressable>
        </View>
      </Section>

      <Section title={t("split.who")}>
        <View className="flex-row items-center gap-2">
          <Input
            value={typed}
            onChangeText={setTyped}
            placeholder={t("split.addPlaceholder")}
            accessibilityLabel={t("split.addPlaceholder")}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => add(typed)}
            className="flex-1"
          />
          <Button variant="secondary" size="icon" className="size-12" accessibilityLabel={t("split.add")} onPress={() => add(typed)}>
            <Icon as={Plus} className="size-5" />
          </Button>
        </View>
        {suggestions.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {suggestions.map((contact) => (
              <Pressable
                key={contact.id}
                accessibilityRole="button"
                onPress={() => add(contact.displayName)}
                className="bg-secondary active:opacity-70 rounded-full px-3 py-1.5"
              >
                <Text className="text-foreground text-sm">{contact.displayName}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {people.length > 0 ? (
          <ListGroup>
            {people.map((person, index) => (
              <View key={person.name} className="flex-row items-center gap-3 px-4 py-2.5">
                <Text className={cn("text-foreground flex-1 text-base", TEXT_START)} numberOfLines={1}>
                  {person.name}
                </Text>
                {mode === "custom" ? (
                  <Input
                    value={person.amount}
                    onChangeText={(text) =>
                      amountOk(text) ? setPeople((current) => current.map((entry, at) => (at === index ? { ...entry, amount: text } : entry))) : undefined
                    }
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    accessibilityLabel={t("split.amountFor", { name: person.name })}
                    className="h-11 w-28 font-mono"
                  />
                ) : (
                  <Text className="text-muted-foreground font-mono text-sm">{each !== undefined ? money(asset, each.toString(), token.decimals) : "—"}</Text>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel={t("split.remove", { name: person.name })} hitSlop={10} onPress={() => setPeople((current) => current.filter((_, at) => at !== index))}>
                  <Icon as={X} className="text-muted-foreground size-4" />
                </Pressable>
              </View>
            ))}
          </ListGroup>
        ) : null}
      </Section>

      <View className="gap-3">
        <SegmentedControl
          label={t("split.how")}
          value={mode}
          onValueChange={(value) => setMode(value as "equal" | "custom")}
          options={[
            { value: "equal", label: t("split.equal") },
            { value: "custom", label: t("split.byHand") },
          ]}
        />
        <ListGroup>
          <ListRow title={t("split.includeMe")} trailing={<Switch checked={includeMe} onCheckedChange={setIncludeMe} accessibilityLabel={t("split.includeMe")} />} onPress={() => setIncludeMe((on) => !on)} />
        </ListGroup>
        <Text className={cn("text-muted-foreground px-1 text-sm", TEXT_START)}>
          {mode === "equal"
            ? each !== undefined && people.length > 0
              ? t("split.eachPays", { amount: money(asset, each.toString(), token.decimals) })
              : t("split.hint")
            : totalBase !== undefined
              ? t("split.customLeft", { amount: money(asset, (totalBase - customSum).toString(), token.decimals) })
              : t("split.hint")}
        </Text>
        <Button disabled={!ready || busy} onPress={() => void create()}>
          <Text>{t("split.create", { count: people.length })}</Text>
        </Button>
      </View>

      {earlier.length > 0 ? (
        <Section title={t("split.yours")}>
          <ListGroup>
            {earlier.map((split) => (
              <ListRow
                key={split.id}
                title={split.title}
                subtitle={`${money(split.asset, split.total, split.assetToken.decimals)} · ${t("split.paidOf", { paid: split.paidCount, count: split.shares.length })}`}
                chevron
                onPress={() => router.push({ pathname: "/split/[id]", params: { id: split.id } })}
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}
      <AssetPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        title={t("assets.pickerTitle")}
        mode="any"
        selected={token.address.toLowerCase()}
        onSelect={({ token: next }) => {
          setToken(next);
          // Amounts typed in more decimals than the new token has are cleared, never rounded.
          if (total && unitsFromCanonical(total, next.decimals) === undefined) setTotal("");
          setPeople((current) => current.map((person) => (person.amount && unitsFromCanonical(person.amount, next.decimals) === undefined ? { ...person, amount: "" } : person)));
        }}
        unavailable={(candidate) => (candidate.status === "impersonator" ? t("tokenPage.n_blocked") : candidate.kind === "permissioned" ? t("tokenPage.n_permissioned") : undefined)}
      />
    </Page>
  );
}
