// Any token's mark (R1, R10): the identity registry's delivered artwork when Kawase has it (USDC, EURC…), else the
// token's own image from a first-party list (LI.FI, CoinGecko via GeckoTerminal), else the labelled neutral disc —
// never a stand-in logo. An optional chain badge sits in the trailing-bottom corner, as on `Mark`.
import { fallbackFontSize, getTokenIdentity, markFile } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { Image, View } from "react-native";
import { rememberTokenLogo, rememberedTokenLogo } from "../lib/token-logos";

const DEFAULT_SIZE = 44;
const BADGE_RATIO = 0.42;
const LABEL_MAX = 4;

type TokenLike = { chainId: number; address: string; symbol: string; logoUrl?: string | null };

type TokenMarkProps = {
  token: TokenLike;
  size?: number;
  /** The chain's entity id ("chain:eip155:8453") for a holding on another chain. */
  chainBadge?: string;
  className?: string;
};

function TokenMark({ token, size = DEFAULT_SIZE, chainBadge, className }: TokenMarkProps) {
  const entity = getTokenIdentity(token.chainId, token.address);
  const [failed, setFailed] = React.useState(false);
  const badgeSize = Math.round(size * BADGE_RATIO);
  const delivered = entity && markFile(entity, "color");
  const label = token.symbol.slice(0, LABEL_MAX).toUpperCase() || "?";
  // A logo handed here is remembered for every other place this token appears; one not handed is looked up.
  if (token.logoUrl) rememberTokenLogo(token.chainId, token.address, token.logoUrl);
  const logoUrl = token.logoUrl ?? rememberedTokenLogo(token.chainId, token.address);

  let body: React.ReactNode;
  if (entity && delivered) body = <Mark entity={entity} size={size} />;
  else if (logoUrl && !failed)
    body = (
      <View className="bg-muted border-border overflow-hidden rounded-full border" style={{ width: size, height: size }}>
        <Image source={{ uri: logoUrl }} style={{ width: size, height: size }} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      </View>
    );
  else
    body = (
      <View className="bg-muted border-border items-center justify-center rounded-full border" style={{ width: size, height: size }}>
        <Text className="text-muted-foreground font-semibold" style={{ fontSize: fallbackFontSize(label, size) }}>
          {label}
        </Text>
      </View>
    );

  return (
    <View accessibilityRole="image" accessibilityLabel={token.symbol} className={cn("relative", className)} style={{ width: size, height: size }}>
      {body}
      {chainBadge ? (
        <View className="bg-background absolute -bottom-0.5 -end-0.5 rounded-full p-px">
          <Mark entity={chainBadge} size={badgeSize} />
        </View>
      ) : null}
    </View>
  );
}

export { TokenMark };
export type { TokenLike, TokenMarkProps };
