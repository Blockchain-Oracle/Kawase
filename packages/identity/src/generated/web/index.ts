// GENERATED from svg/ by build.mjs. Do not edit; replace the SVG and rebuild.
import MarkAave from "./aave";
import MarkAaveMono from "./aave-mono";
import MarkAcross from "./across";
import MarkAcrossMono from "./across-mono";
import MarkApple from "./apple";
import MarkAppleMono from "./apple-mono";
import MarkArbitrum from "./arbitrum";
import MarkArbitrumMono from "./arbitrum-mono";
import MarkArc from "./arc";
import MarkArcMono from "./arc-mono";
import MarkAvalanche from "./avalanche";
import MarkAvalancheMono from "./avalanche-mono";
import MarkBase from "./base";
import MarkBaseMono from "./base-mono";
import MarkBtc from "./btc";
import MarkBtcMono from "./btc-mono";
import MarkCircle from "./circle";
import MarkCircleMono from "./circle-mono";
import MarkDebridge from "./debridge";
import MarkDebridgeMono from "./debridge-mono";
import MarkEthereum from "./ethereum";
import MarkEthereumMono from "./ethereum-mono";
import MarkEurc from "./eurc";
import MarkEurcMono from "./eurc-mono";
import MarkGoogle from "./google";
import MarkGoogleMono from "./google-mono";
import MarkKawase from "./kawase";
import MarkKawaseMono from "./kawase-mono";
import MarkKyberswap from "./kyberswap";
import MarkKyberswapMono from "./kyberswap-mono";
import MarkMorpho from "./morpho";
import MarkMorphoMono from "./morpho-mono";
import MarkOptimism from "./optimism";
import MarkOptimismMono from "./optimism-mono";
import MarkPolygon from "./polygon";
import MarkPolygonMono from "./polygon-mono";
import MarkSolana from "./solana";
import MarkSolanaMono from "./solana-mono";
import MarkUnichain from "./unichain";
import MarkUnichainMono from "./unichain-mono";
import MarkUsdc from "./usdc";
import MarkUsdcMono from "./usdc-mono";
import MarkWeth from "./weth";
import MarkWethMono from "./weth-mono";

/** File stem → component. Absent stems have not been delivered (see PROVENANCE.md). */
export const MARKS = {
  "aave": MarkAave,
  "aave-mono": MarkAaveMono,
  "across": MarkAcross,
  "across-mono": MarkAcrossMono,
  "apple": MarkApple,
  "apple-mono": MarkAppleMono,
  "arbitrum": MarkArbitrum,
  "arbitrum-mono": MarkArbitrumMono,
  "arc": MarkArc,
  "arc-mono": MarkArcMono,
  "avalanche": MarkAvalanche,
  "avalanche-mono": MarkAvalancheMono,
  "base": MarkBase,
  "base-mono": MarkBaseMono,
  "btc": MarkBtc,
  "btc-mono": MarkBtcMono,
  "circle": MarkCircle,
  "circle-mono": MarkCircleMono,
  "debridge": MarkDebridge,
  "debridge-mono": MarkDebridgeMono,
  "ethereum": MarkEthereum,
  "ethereum-mono": MarkEthereumMono,
  "eurc": MarkEurc,
  "eurc-mono": MarkEurcMono,
  "google": MarkGoogle,
  "google-mono": MarkGoogleMono,
  "kawase": MarkKawase,
  "kawase-mono": MarkKawaseMono,
  "kyberswap": MarkKyberswap,
  "kyberswap-mono": MarkKyberswapMono,
  "morpho": MarkMorpho,
  "morpho-mono": MarkMorphoMono,
  "optimism": MarkOptimism,
  "optimism-mono": MarkOptimismMono,
  "polygon": MarkPolygon,
  "polygon-mono": MarkPolygonMono,
  "solana": MarkSolana,
  "solana-mono": MarkSolanaMono,
  "unichain": MarkUnichain,
  "unichain-mono": MarkUnichainMono,
  "usdc": MarkUsdc,
  "usdc-mono": MarkUsdcMono,
  "weth": MarkWeth,
  "weth-mono": MarkWethMono,
} as const;

export type MarkStem = keyof typeof MARKS;
