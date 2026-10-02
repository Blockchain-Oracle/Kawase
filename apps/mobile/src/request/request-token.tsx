// A request's token, for any asset (R1): its mark and its amount in its own decimals. Requests from before any-asset
// requests carry only "USDC"/"EURC"; the api fills `assetToken` for those too.
import type { NetworkId, PaymentRequest } from "@kawase/api-client";
import { CHAIN_IDS, arcIdentity } from "@kawase/identity";
import { formatTokenAmount } from "@kawase/money";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

const TOKEN_DIGITS = 6;
const STABLE_DECIMALS = 6;

type Requested = Pick<PaymentRequest, "asset" | "amount" | "network"> & { assetToken?: PaymentRequest["assetToken"] | undefined };

export const requestDecimals = (request: Requested) => request.assetToken?.decimals ?? STABLE_DECIMALS;

/** "12.5" (or "12.5 ARGUS" with the symbol). */
export function requestFigures(request: Requested, locale: string, withSymbol = false) {
  return formatTokenAmount(BigInt(request.amount), requestDecimals(request), request.asset, locale, { fractionDigits: TOKEN_DIGITS, trimZeros: true, withSymbol });
}

export function RequestTokenMark({ request, size }: { request: Requested & { network: NetworkId }; size: number }) {
  const ids = arcIdentity(request.network);
  const chainId = request.network === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet;
  const address = request.assetToken?.address ?? "";
  return <TokenMark token={{ chainId, address, symbol: request.asset }} chainBadge={ids.chain} size={size} />;
}
