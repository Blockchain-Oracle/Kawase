// Real entity marks from @kawase/identity through ui-web's Mark (the same component the web app uses). Names map to
// the identity registry's keys; an unknown name renders the registry's labelled neutral disc, never a stand-in logo.
import { CHAIN_IDS, ENTITIES, arcIdentity, chainKey, providerKey, venueKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-web/components/mark";

const arc = arcIdentity("mainnet");
/** Arc mainnet tokens with marks, found by symbol (Aave V4's reserves: cirBTC, WETH). */
const arcToken = (symbol: string) =>
  ENTITIES.find((entity) => entity.kind === "token" && entity.symbol === symbol)?.id ?? symbol;
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
  aave: providerKey("aave"),
  aero: providerKey("aero"),
  defillama: providerKey("defillama"),
  exa: providerKey("exa"),
  blockrun: providerKey("blockrun"),
  cctp: venueKey("cctp"),
  across: venueKey("across"),
  relay: venueKey("relay"),
  lifi: venueKey("lifi"),
  debridge: venueKey("debridge"),
  kyberswap: venueKey("kyberswap"),
  cirbtc: arcToken("cirBTC"),
  weth: arcToken("WETH"),
};

const DEFAULT_SIZE = 28;

/** The identity registry key for a short name (`usdc`, `relay`), or the name itself. */
export const markEntity = (name: string) => ENTITY_BY_NAME[name] ?? name;

/** `<Marks names="usdc eurc arc" />` in MDX. */
export function Marks({ names, size = DEFAULT_SIZE }: { names: string; size?: number }) {
  return (
    <span className="not-prose my-2 inline-flex flex-wrap items-center gap-2 align-middle">
      {names
        .split(/\s+/)
        .filter(Boolean)
        .map((name) => (
          <Mark key={name} entity={markEntity(name)} size={size} />
        ))}
    </span>
  );
}
