// GENERATED from svg/ by build.mjs. Do not edit; replace the SVG and rebuild.
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
import MarkCircle from "./circle";
import MarkCircleMono from "./circle-mono";
import MarkEthereum from "./ethereum";
import MarkEthereumMono from "./ethereum-mono";
import MarkEurc from "./eurc";
import MarkEurcMono from "./eurc-mono";
import MarkGoogle from "./google";
import MarkGoogleMono from "./google-mono";
import MarkKawase from "./kawase";
import MarkKawaseMono from "./kawase-mono";
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

/** File stem → component. Absent stems have not been delivered (see PROVENANCE.md). */
export const MARKS = {
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
  "circle": MarkCircle,
  "circle-mono": MarkCircleMono,
  "ethereum": MarkEthereum,
  "ethereum-mono": MarkEthereumMono,
  "eurc": MarkEurc,
  "eurc-mono": MarkEurcMono,
  "google": MarkGoogle,
  "google-mono": MarkGoogleMono,
  "kawase": MarkKawase,
  "kawase-mono": MarkKawaseMono,
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
} as const;

export type MarkStem = keyof typeof MARKS;
