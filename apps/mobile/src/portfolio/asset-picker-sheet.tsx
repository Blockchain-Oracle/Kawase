// The universal asset picker as a sheet (R1): the person's holdings across chains by value, search by name, symbol or
// address across Arc (debounced, through the api's shared cache), Hidden on demand, and "Add money" at the end.
// Each flow says what it accepts through `unavailable`, so a token it cannot use stays visible with the reason
// (R2) instead of disappearing. Used by Swap now and by Send, Request, Earn and Withdraw as they generalise.
import * as React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { HoldingView, TokenSearchResult, TokenView } from "@kawase/api-client";
import { getChainIdentity, chainKey } from "@kawase/identity";
import { AssetPicker, type PickerItem } from "@kawase/ui-native/components/asset-picker";
import { Sheet } from "@kawase/ui-native/components/sheet";

import { change, holdingAmount, money, price, USD_FX } from "@/portfolio/format";
import { tokenChip } from "@/portfolio/token-chip";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

export type AssetChoice = { token: TokenView; holding: HoldingView | null };

type AssetPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "held": only what the person holds on Arc (paying); "any": holdings first, then any token on Arc (receiving). */
  mode: "held" | "any";
  onSelect: (choice: AssetChoice) => void;
  /** This flow's reason a token cannot be chosen, if any (R2). */
  unavailable?: (token: TokenView) => string | undefined;
  /** The current choice (lower-case address). */
  selected?: string | undefined;
  onAddMoney?: () => void;
};

const SEARCH_DEBOUNCE_MS = 300;

const matches = (token: TokenView, query: string) => {
  const needle = query.trim().toLowerCase();
  return !needle || token.symbol.toLowerCase().includes(needle) || token.name.toLowerCase().includes(needle) || token.address.toLowerCase() === needle;
};

export function AssetPickerSheet({ open, onClose, title, mode, onSelect, unavailable, selected, onAddMoney }: AssetPickerSheetProps) {
  const { t } = useT();
  const { locale } = useLocale();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useSession();
  const { portfolio, loading, refresh } = usePortfolio();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<TokenSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [showHidden, setShowHidden] = React.useState(false);
  const fx = portfolio?.fx ?? USD_FX;
  const network = user?.activeNetwork;

  React.useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Search the whole network for what the holdings do not cover.
  React.useEffect(() => {
    if (mode !== "any" || !query.trim()) {
      setResults([]);
      return undefined;
    }
    setSearching(true);
    let live = true;
    const timer = setTimeout(() => {
      api.tokens
        .search(query.trim(), network)
        .then(({ results: found }) => {
          if (live) setResults(found);
        })
        .catch(() => undefined)
        .finally(() => {
          if (live) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, mode, network]);

  const choose = (choice: AssetChoice) => {
    onSelect(choice);
    setQuery("");
    onClose();
  };

  const holdingRow = (holding: HoldingView, other = false): PickerItem => {
    const reason = other ? t("assets.bringToArc") : unavailable?.(holding.token);
    const badge = other && getChainIdentity(holding.token.chainId) ? chainKey(holding.token.chainId) : undefined;
    const chip = other ? { label: holding.chainName, tone: "muted" as const } : tokenChip(holding.token, t);
    return {
      key: `${holding.token.chainId}:${holding.token.address}`,
      token: holding.token,
      amount: holdingAmount(holding, locale),
      value: money(holding.valueUsd, fx, locale),
      change24hPct: holding.change24hPct,
      ...(change(holding.change24hPct, locale) ? { changeLabel: change(holding.change24hPct, locale)! } : {}),
      ...(chip ? { chip } : {}),
      ...(badge ? { chainBadge: badge } : {}),
      ...(reason ? { unavailable: reason } : {}),
      selected: holding.token.address.toLowerCase() === selected,
      ...(reason ? {} : { onPress: () => choose({ token: holding.token, holding }) }),
    };
  };

  const held = (portfolio?.assets ?? []).filter((holding) => matches(holding.token, query));
  const heldAddresses = new Set(held.map((holding) => holding.token.address.toLowerCase()));
  const other = (portfolio?.otherChains ?? []).filter((holding) => matches(holding.token, query));
  const found = results.filter((result) => !heldAddresses.has(result.token.address.toLowerCase()));
  const hidden = (portfolio?.hidden ?? []).filter((holding) => matches(holding.token, query));

  const searchRow = (result: TokenSearchResult): PickerItem => {
    const reason = unavailable?.(result.token);
    const chip = tokenChip(result.token, t);
    return {
      key: `search:${result.token.address}`,
      token: result.token,
      value: price(result.priceUsd, fx, locale),
      ...(chip ? { chip } : {}),
      ...(reason ? { unavailable: reason } : {}),
      selected: result.token.address.toLowerCase() === selected,
      ...(reason ? {} : { onPress: () => choose({ token: result.token, holding: null }) }),
    };
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
    >
      <AssetPicker
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={t("assets.search")}
        loading={(loading && !portfolio) || searching}
        emptyLabel={t("assets.noMatch")}
        sections={[
          { key: "held", label: t("assets.yourAssets"), items: held.map((holding) => holdingRow(holding)) },
          { key: "found", label: t("assets.results"), items: found.map(searchRow) },
          { key: "other", label: t("assets.onOtherChains"), items: other.map((holding) => holdingRow(holding, true)) },
        ]}
        hidden={{
          label: t("assets.hiddenCount", { count: hidden.length }),
          open: showHidden,
          onToggle: () => setShowHidden((value) => !value),
          items: hidden.map((holding) => holdingRow(holding)),
        }}
        {...(onAddMoney ? { footer: { label: t("assets.addMoney"), onPress: onAddMoney } } : {})}
      />
    </Sheet>
  );
}
