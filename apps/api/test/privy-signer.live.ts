// Live check of the Privy signing path on Arc testnet, with no person signing in: a Privy wallet owned by the app is
// put behind the same `privySigner` adapter the phone and web use (packages/wallet/src/privy.ts). It signs the 7702
// setup authorization ("Set it up on Arc Testnet"), the relayer sends the type-4 transaction as setupSubmit does, and
// the account must end up delegated to MetaMask's DeleGator. Then a message and a transaction are signed and recovered,
// and a grant with no limits must be refused before signing. Run: pnpm --filter @kawase/api exec tsx --env-file=../../.env test/privy-signer.live.ts
import { PrivyClient } from "@privy-io/node";
import {
  createPublicClient,
  createWalletClient,
  http,
  recoverMessageAddress,
  recoverTransactionAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { recoverAuthorizationAddress } from "viem/utils";

import { grantTypedData, isWalletSetUp, setupAuthorizationRequest } from "@kawase/integrations-delegation";
import { getNetwork } from "@kawase/networks";
import { privySigner } from "@kawase/wallet";

const need = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
};

const network = getNetwork("testnet");
const privy = new PrivyClient({ appId: need("PRIVY_APP_ID"), appSecret: need("PRIVY_APP_SECRET") });
const client = createPublicClient({ chain: network.viemChain, transport: http() });
const relayer = createWalletClient({
  account: privateKeyToAccount(need("RELAYER_PRIVATE_KEY_TESTNET") as Hex),
  chain: network.viemChain,
  transport: http(),
});

const wallet = await privy.wallets().create({ chain_type: "ethereum", display_name: "kawase-signer-check" });
const address = wallet.address as Hex;
console.log("privy wallet", wallet.id, address);

const signer = privySigner({
  address,
  approval: "session",
  async signHash(hash) {
    const result = await privy.wallets().ethereum().signSecp256k1(wallet.id, { params: { hash } });
    return result.signature as Hex;
  },
});

// 1. The setup step, exactly as the app does it: sign the authorization, the relayer sends it.
const nonce = await client.getTransactionCount({ address });
const authorization = await signer.signAuthorization!(setupAuthorizationRequest(network, nonce));
const recovered = await recoverAuthorizationAddress({ authorization });
if (recovered.toLowerCase() !== address.toLowerCase()) throw new Error(`authorization recovered to ${recovered}`);
const hash = await relayer.sendTransaction({ authorizationList: [authorization], to: address, data: "0x" });
const receipt = await client.waitForTransactionReceipt({ hash });
const setUp = isWalletSetUp(await client.getCode({ address }));
console.log(
  "setup tx",
  `https://testnet.arcscan.app/tx/${hash}`,
  receipt.status,
  setUp ? "delegated ✓" : "NOT delegated",
);
if (!setUp) throw new Error("the setup did not take");

// 2. A message, a grant and a transaction, each recovered to the wallet.
const message = "Kawase signer check";
const messageSigner = await recoverMessageAddress({ message, signature: await signer.signMessage({ message }) });
const grant = {
  delegate: relayer.account.address,
  delegator: address,
  authority: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as Hex,
  caveats: [],
  salt: 1n,
  signature: "0x" as Hex,
};
// A grant with no limits is refused on the device before anything is signed (checks.ts): the guard holds.
const typed = grantTypedData(network, grant as never);
const refused = await signer.signTypedData(typed as never).then(
  () => false,
  (error: Error) => error.name === "SigningRefused",
);
console.log("unlimited grant refused", refused ? "✓" : "✗ it was signed");
if (!refused) process.exitCode = 1;
const serialized = await signer.signTransaction!({
  chainId: network.chainId,
  type: "eip1559",
  to: relayer.account.address,
  value: 0n,
  nonce: await client.getTransactionCount({ address }),
  gas: 21_000n,
  maxFeePerGas: 1n,
  maxPriorityFeePerGas: 1n,
});
const txSigner = await recoverTransactionAddress({ serializedTransaction: serialized as never });
for (const [what, who] of [
  ["message", messageSigner],
  ["transaction", txSigner],
] as const) {
  console.log(what, who.toLowerCase() === address.toLowerCase() ? "✓" : `✗ ${who}`);
  if (who.toLowerCase() !== address.toLowerCase()) process.exitCode = 1;
}
