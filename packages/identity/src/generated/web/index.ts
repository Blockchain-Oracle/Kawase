// GENERATED from svg/ by build.mjs. Do not edit; replace the SVG and rebuild.
import MarkAisa from "./aisa";
import MarkAisaMono from "./aisa-mono";
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
import MarkBlockrun from "./blockrun";
import MarkBlockrunMono from "./blockrun-mono";
import MarkCircle from "./circle";
import MarkCircleMono from "./circle-mono";
import MarkDefillama from "./defillama";
import MarkEthereum from "./ethereum";
import MarkEthereumMono from "./ethereum-mono";
import MarkEurc from "./eurc";
import MarkEurcMono from "./eurc-mono";
import MarkExa from "./exa";
import MarkExaMono from "./exa-mono";
import MarkGoldsky from "./goldsky";
import MarkGoogle from "./google";
import MarkGoogleMono from "./google-mono";
import MarkKawase from "./kawase";
import MarkKawaseMono from "./kawase-mono";
import MarkMorpho from "./morpho";
import MarkMorphoMono from "./morpho-mono";
import MarkOptimism from "./optimism";
import MarkOptimismMono from "./optimism-mono";
import MarkPolygon from "./polygon";
import MarkPolygonMono from "./polygon-mono";
import MarkQuicknode from "./quicknode";
import MarkQuicknodeMono from "./quicknode-mono";
import MarkSolana from "./solana";
import MarkSolanaMono from "./solana-mono";
import MarkUnichain from "./unichain";
import MarkUnichainMono from "./unichain-mono";
import MarkUsdc from "./usdc";
import MarkUsdcMono from "./usdc-mono";
import MarkVangrid from "./vangrid";
import MarkVangridMono from "./vangrid-mono";

/** File stem → component. Absent stems have not been delivered (see PROVENANCE.md). */
export const MARKS = {
  "aisa": MarkAisa,
  "aisa-mono": MarkAisaMono,
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
  "blockrun": MarkBlockrun,
  "blockrun-mono": MarkBlockrunMono,
  "circle": MarkCircle,
  "circle-mono": MarkCircleMono,
  "defillama": MarkDefillama,
  "ethereum": MarkEthereum,
  "ethereum-mono": MarkEthereumMono,
  "eurc": MarkEurc,
  "eurc-mono": MarkEurcMono,
  "exa": MarkExa,
  "exa-mono": MarkExaMono,
  "goldsky": MarkGoldsky,
  "google": MarkGoogle,
  "google-mono": MarkGoogleMono,
  "kawase": MarkKawase,
  "kawase-mono": MarkKawaseMono,
  "morpho": MarkMorpho,
  "morpho-mono": MarkMorphoMono,
  "optimism": MarkOptimism,
  "optimism-mono": MarkOptimismMono,
  "polygon": MarkPolygon,
  "polygon-mono": MarkPolygonMono,
  "quicknode": MarkQuicknode,
  "quicknode-mono": MarkQuicknodeMono,
  "solana": MarkSolana,
  "solana-mono": MarkSolanaMono,
  "unichain": MarkUnichain,
  "unichain-mono": MarkUnichainMono,
  "usdc": MarkUsdc,
  "usdc-mono": MarkUsdcMono,
  "vangrid": MarkVangrid,
  "vangrid-mono": MarkVangridMono,
} as const;

export type MarkStem = keyof typeof MARKS;
