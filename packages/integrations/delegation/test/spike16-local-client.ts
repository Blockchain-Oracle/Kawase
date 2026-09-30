// Drives the spike-16 server exactly as the app will, with a local key in place of the Turnkey wallet.
// It proves the server half before any wallet provider is involved.
// Run (server must be up): pnpm --filter @kawase/integrations-delegation exec tsx test/spike16-local-client.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { TransactionSerializable, TypedDataDefinition } from "viem";
import { localKeySigner } from "@kawase/wallet";

const API = "http://localhost:3022";
const post = async (path: string, body: Record<string, string>) => {
  const response = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await response.json()) as Record<string, any>;
};
const signer = localKeySigner(generatePrivateKey());
const wallet = signer.address;
const other = privateKeyToAccount(generatePrivateKey()).address;
const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  checks.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, detail === undefined ? "" : JSON.stringify(detail));
};

async function signAndSubmit(request: Record<string, any>) {
  const t = request.transaction;
  const transaction: TransactionSerializable = {
    type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: BigInt(t.value),
    gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas),
  };
  return post("/wallet/submit", { id: request.id, signedTransaction: await signer.signTransaction(transaction) });
}

const setup = await post("/setup/request", { wallet });
const authorization = await signer.signAuthorization(setup.authorization);
// Send only JSON-safe fields (viem also returns `v` as a bigint; `yParity` carries the same information).
const { address, chainId, nonce, r: authR, s: authS, yParity } = authorization;
const setupResult = await post("/setup/submit", { wallet, authorization: JSON.stringify({ address, chainId, nonce, r: authR, s: authS, yParity }) });
check("setup relayed for an empty wallet", setupResult.setUp === true, setupResult.tx);

await post("/fund", { wallet });
const grantRequest = await post("/allowance/request", { wallet, amount: "0.3" });
const signature = await signer.signTypedData(grantRequest.typedData as TypedDataDefinition);
const allowance = await post("/allowance/submit", { id: grantRequest.id, signature });
check("allowance signed from the JSON the server sent, and verified", allowance.verified === true, allowance.receipt?.amountPerPeriod);

let r = await post("/agent/send", { wallet, to: other, amount: "0.1" });
check("agent sends 0.1 inside the allowance", r.ok === true, r.tx);
r = await post("/agent/send", { wallet, to: other, amount: "0.5" });
check("agent refused above the allowance", r.ok === false, r.reason);

r = await signAndSubmit(await post("/wallet/send/request", { wallet, to: other, amount: "0.4" }));
check("wallet signs a 0.4 send itself; server verifies and broadcasts", r.status === "success", r.tx);

const tampered = await post("/wallet/send/request", { wallet, to: other, amount: "0.01" });
tampered.transaction.to = other; // sign something other than what was requested
r = await signAndSubmit(tampered);
check("a signed transaction that differs from the request is rejected", typeof r.error === "string", r.error);

r = await signAndSubmit(await post("/revoke/request", { wallet }));
check("wallet revokes with one transaction", r.status === "success", r.tx);
r = await post("/agent/send", { wallet, to: other, amount: "0.05" });
check("agent refused after the revoke", r.ok === false, r.reason);

const passed = checks.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
