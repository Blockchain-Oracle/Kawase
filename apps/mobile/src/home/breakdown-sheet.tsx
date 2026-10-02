// The breakdown behind the balance hero (surfaces.md Home §2): Available (by asset) · In positions · On other chains
// (with Bring to Arc), each with its share of the total.
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PortfolioView } from "@kawase/api-client";
import { getChainIdentity, chainKey } from "@kawase/identity";
import { Amount } from "@kawase/ui-native/components/amount";
import { AssetRow } from "@kawase/ui-native/components/asset-row";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { holdingAmount, money } from "@/portfolio/format";
import { useThemeColors } from "@/theme/use-theme-colors";

type BreakdownSheetProps = { open: boolean; onClose: () => void; portfolio: PortfolioView | undefined };

const POSITION_MARK = 36;
const APY_DIGITS = 2;

export function BreakdownSheet({ open, onClose, portfolio }: BreakdownSheetProps) {
  const { t } = useT();
  const { locale } = useLocale();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const router = useRouter();
  const fx = portfolio?.fx ?? { currency: "USD", perUsd: 1 };
  const go = (href: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(href);
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("assets.breakdownTitle")}
      {...(portfolio ? { subtitle: money(portfolio.totalUsd, fx, locale) } : {})}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
      className="gap-5"
    >
      {portfolio ? (
        <>
          <ListGroup label={`${t("assets.available")} · ${money(portfolio.breakdown.availableUsd, fx, locale)}`}>
            {portfolio.assets.map((holding) => (
              <AssetRow
                key={holding.token.address}
                token={holding.token}
                amount={holdingAmount(holding, locale)}
                value={money(holding.valueUsd, fx, locale)}
                onPress={() => go(`/token/${holding.token.chainId}/${holding.token.address}`)}
              />
            ))}
          </ListGroup>
          {portfolio.positions.length > 0 ? (
            <ListGroup label={`${t("assets.inPositions")} · ${money(portfolio.breakdown.positionsUsd, fx, locale)}`}>
              {portfolio.positions.map((position) => (
                <ListRow
                  key={position.id}
                  title={position.title}
                  {...(position.apyPct ? { subtitle: t("assets.apy", { apy: position.apyPct.toFixed(APY_DIGITS) }) } : {})}
                  leading={position.token ? <TokenMark token={position.token} size={POSITION_MARK} /> : undefined}
                  trailing={<Amount className="text-foreground text-base">{money(position.valueUsd, fx, locale)}</Amount>}
                  onPress={() => go("/earn")}
                />
              ))}
            </ListGroup>
          ) : null}
          {portfolio.otherChains.length > 0 ? (
            <ListGroup label={`${t("assets.otherChainsTotal")} · ${money(portfolio.breakdown.otherChainsUsd, fx, locale)}`}>
              {portfolio.otherChains.map((holding) => (
                <AssetRow
                  key={`${holding.token.chainId}:${holding.token.address}`}
                  token={holding.token}
                  {...(getChainIdentity(holding.token.chainId) ? { chainBadge: chainKey(holding.token.chainId) } : {})}
                  amount={holdingAmount(holding, locale)}
                  value={money(holding.valueUsd, fx, locale)}
                  chip={{ label: holding.chainName, tone: "muted" }}
                />
              ))}
            </ListGroup>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
