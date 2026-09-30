// GENERATED from svg/ by build.mjs. Do not edit; replace the SVG and rebuild.
import MarkBase from "./base";
import MarkBaseMono from "./base-mono";
import MarkEthereum from "./ethereum";
import MarkEthereumMono from "./ethereum-mono";
import MarkSolana from "./solana";

/** File stem → component. Absent stems have not been delivered (see PROVENANCE.md). */
export const MARKS = {
  "base": MarkBase,
  "base-mono": MarkBaseMono,
  "ethereum": MarkEthereum,
  "ethereum-mono": MarkEthereumMono,
  "solana": MarkSolana,
} as const;

export type MarkStem = keyof typeof MARKS;
