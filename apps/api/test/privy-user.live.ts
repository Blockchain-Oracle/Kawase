// Read-only: what Privy knows about the user behind a wallet address (linked accounts, each wallet's client type,
// recovery method, delegation, imported), to diagnose why the browser's embedded wallet does not connect.
// Run: pnpm --filter @kawase/api exec tsx test/privy-user.live.ts 0x…
import { config } from "dotenv";
import { PrivyClient } from "@privy-io/node";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
const need = (name: string) => process.env[name] ?? (() => { throw new Error(`${name} missing`); })();
const privy = new PrivyClient({ appId: need("PRIVY_APP_ID"), appSecret: need("PRIVY_APP_SECRET") });

for (const address of process.argv.slice(2)) {
  try {
    const user = (await privy.users().getByWalletAddress({ address })) as unknown as { id: string; linked_accounts: Record<string, unknown>[] };
    console.log(`${address}: user ${user.id}`);
    for (const account of user.linked_accounts) {
      const { type, address: wallet, wallet_client_type, connector_type, recovery_method, imported, delegated, chain_type, wallet_index, id } = account as Record<string, unknown>;
      console.log("  ", JSON.stringify({ type, wallet, wallet_client_type, connector_type, recovery_method, imported, delegated, chain_type, wallet_index, id }));
    }
  } catch (error) {
    console.log(`${address}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
