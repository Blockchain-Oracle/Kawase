// Which token an invoice or a payout is in (R1: every asset is first-class): USDC and EURC first, then every other
// token the wallet holds on Arc, then any canonical or listed Arc token found by name, symbol or address. Look-alikes
// and impersonators never appear (the api refuses them too). Each choice carries its own decimals.
import { Search } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { TokenView } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export type TokenChoiceValue = { key: string; symbol: string; decimals: number; token: TokenView | null };

const STABLES = ["USDC", "EURC"] as const;
const STABLE_DECIMALS = 6;
const MARK_SIZE = 20;
const SEARCH_MIN = 2;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_SHOWN = 6;
const TRUSTED = new Set<TokenView["status"]>(["canonical", "listed"]);
const BLOCKED = new Set<TokenView["status"]>(["lookalike", "impersonator"]);
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const USDC_CHOICE: TokenChoiceValue = { key: "USDC", symbol: "USDC", decimals: STABLE_DECIMALS, token: null };

/** What the api takes: the symbol for USDC and EURC, the address for anything else. */
export const assetParam = (choice: TokenChoiceValue) => (choice.token ? choice.token.address : choice.symbol);

export function TokenChoice({ value, onChange }: { value: TokenChoiceValue; onChange: (choice: TokenChoiceValue) => void }) {
  const { t } = useT();
  const { user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const ids = arcIdentity(network);
  const { portfolio } = usePortfolio();
  const [query, setQuery] = React.useState("");
  const [found, setFound] = React.useState<TokenView[]>([]);

  React.useEffect(() => {
    const text = query.trim();
    if (text.length < SEARCH_MIN) {
      setFound([]);
      return;
    }
    const timer = setTimeout(() => {
      api.tokens
        .search(text, network)
        // A typed address is the person naming the exact contract: unverified is fine there (never a look-alike).
        .then(({ results }) => setFound(results.map((result) => result.token).filter((token) => TRUSTED.has(token.status) || (ADDRESS.test(text) && !BLOCKED.has(token.status))).slice(0, SEARCH_SHOWN)))
        .catch(() => setFound([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, network]);

  const isStable = (symbol: string) => (STABLES as readonly string[]).includes(symbol);
  const others = [...(portfolio?.assets ?? []).filter((holding) => BigInt(holding.balance) > BigInt(0)).map((holding) => holding.token), ...found].filter(
    (token, index, all) => !isStable(token.symbol) && !BLOCKED.has(token.status) && all.findIndex((other) => other.address === token.address) === index,
  );
  const choices: TokenChoiceValue[] = [
    ...STABLES.map((symbol) => ({ key: symbol, symbol, decimals: STABLE_DECIMALS, token: null })),
    ...others.map((token) => ({ key: token.address, symbol: token.symbol, decimals: token.decimals, token })),
    // A token picked from an earlier search stays on the list.
    ...(value.token && !others.some((token) => token.address === value.token?.address) ? [value] : []),
  ];

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {choices.map((choice) => {
          const selected = choice.key === value.key;
          return (
            <Pressable
              key={choice.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(choice)}
              className={cn("flex-row items-center gap-2 rounded-full border px-3.5 py-2", selected ? "bg-primary border-primary" : "bg-card border-border")}
            >
              {choice.token ? <TokenMark token={choice.token} size={MARK_SIZE} /> : <Mark entity={choice.symbol === "EURC" ? ids.eurc : ids.usdc} size={MARK_SIZE} />}
              <Text className={cn("text-sm font-semibold", selected ? "text-primary-foreground" : "text-foreground")}>{choice.symbol}</Text>
            </Pressable>
          );
        })}
      </View>
      <View className="bg-card border-border flex-row items-center gap-2 rounded-2xl border px-3">
        <Icon as={Search} className="text-muted-foreground size-4" />
        <Input className="flex-1 border-0 bg-transparent px-0" value={query} onChangeText={setQuery} placeholder={t("business.otherToken")} autoCapitalize="none" autoCorrect={false} />
      </View>
    </View>
  );
}
