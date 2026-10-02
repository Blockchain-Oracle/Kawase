// Real entity marks from @kawase/identity through ui-web's Mark (the same component the web app uses). Names map to
// the identity registry's keys; an unknown name renders the registry's labelled neutral disc, never a stand-in logo.
import { CHAIN_IDS, arcIdentity, chainKey, providerKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-web/components/mark";

const arc = arcIdentity("mainnet");
const ENTITY_BY_NAME: Record<string, string> = {
  usdc: arc.usdc,
  eurc: arc.eurc,
  arc: arc.chain,
  ethereum: chainKey(CHAIN_IDS.ethereum),
  base: chainKey(CHAIN_IDS.base),
  arbitrum: chainKey(CHAIN_IDS.arbitrum),
  optimism: chainKey(CHAIN_IDS.optimism),
  polygon: chainKey(CHAIN_IDS.polygon),
  avalanche: chainKey(CHAIN_IDS.avalanche),
  unichain: chainKey(CHAIN_IDS.unichain),
  circle: providerKey("circle"),
  morpho: providerKey("morpho"),
  apple: providerKey("apple"),
  google: providerKey("google"),
  kawase: providerKey("kawase"),
};

const DEFAULT_SIZE = 28;

/** `<Marks names="usdc eurc arc" />` in MDX. */
export function Marks({ names, size = DEFAULT_SIZE }: { names: string; size?: number }) {
  return (
    <span className="not-prose my-2 inline-flex flex-wrap items-center gap-2 align-middle">
      {names
        .split(/\s+/)
        .filter(Boolean)
        .map((name) => (
          <Mark key={name} entity={ENTITY_BY_NAME[name] ?? name} size={size} />
        ))}
    </span>
  );
}
