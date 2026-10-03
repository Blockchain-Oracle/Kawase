// H4, marketplace part (security review 2026-10-03), on Arc testnet: signing a new marketplace grant while an earlier
// one still works disables the earlier one on chain in the same step. The request carries the shared on-chain revoke
// (`revokeGrantsRequest`: a one-time delegation for exactly that `disableDelegation`, the relayer pays), the wallet
// signs it with the grant, it lands before the new grant goes on, and the DelegationManager then reports the old
// delegation disabled. Without the revoke the new grant is refused. Uses the shared relayer (run on its own).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import type { Hex, TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { hashDelegation } from "@metamask/smart-accounts-kit/utils";

import { grants } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { Discovery } from "@kawase/integrations-x402";
import { DELEGATION_FRAMEWORK } from "@kawase/networks";

import type { AgentWalletProvider } from "../src/marketplace/agent-wallets";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET);

/** The grant names an agent wallet as its only recipient; nothing is moved here, so no Circle wallet is made. */
const agentWallets: AgentWalletProvider = {
  create: async () => ({ walletId: randomUUID(), address: privateKeyToAccount(generatePrivateKey()).address }),
  signTypedData: async () => {
    throw new Error("nothing is paid in this test");
  },
};

type GrantRequest = { grantId: string; typedData: Record<string, unknown>; revoke: { requestId: string; relayed?: true; typedData?: Record<string, unknown> } | null };

test("a new marketplace grant disables the one it replaces on chain, in the same step", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const testnet = chains.get("testnet")!;
  const wallet = privateKeyToAccount(generatePrivateKey());
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "supersede", email: `supersede-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, undefined, undefined, undefined, undefined, { agentWallets, discovery: new Discovery({}) });
  let userId = "";
  let token = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "supersede-01" } }));
  await expectStatus(signIn, 201, "sign-in");
  ({ token } = (await signIn.json()) as { token: string });
  userId = ((await (await call("GET", "/me")).json()) as { user: { id: string } }).user.id;
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    200,
    "setup",
  );

  // The first grant: nothing to replace.
  const first = (await (await call("POST", "/marketplace/agent-wallet/grant", {})).json()) as GrantRequest;
  assert.equal(first.revoke, null, "nothing to revoke yet");
  await expectStatus(await call("POST", "/marketplace/agent-wallet/grant/submit", { grantId: first.grantId, signature: await wallet.signTypedData(first.typedData as unknown as TypedDataDefinition) }), 200, "first grant");

  // A second grant: its request carries the first one's revoke (relayed: the wallet holds no USDC). Without the
  // revoke the new grant is refused; with it, both signed in the one step, the old one goes off first.
  const second = (await (await call("POST", "/marketplace/agent-wallet/grant", {})).json()) as GrantRequest;
  assert.ok(second.revoke?.relayed && second.revoke.typedData, `the earlier grant is offered for a relayed revoke (${JSON.stringify(second.revoke)})`);
  const grantSignature = await wallet.signTypedData(second.typedData as unknown as TypedDataDefinition);
  await expectStatus(await call("POST", "/marketplace/agent-wallet/grant/submit", { grantId: second.grantId, signature: grantSignature }), 422, "refused without the revoke");
  const submitted = await call("POST", "/marketplace/agent-wallet/grant/submit", {
    grantId: second.grantId,
    signature: grantSignature,
    revoke: { requestId: second.revoke.requestId, signed: await wallet.signTypedData(second.revoke.typedData as unknown as TypedDataDefinition) },
  });
  await expectStatus(submitted, 200, "second grant");

  const [old] = await db.select().from(grants).where(eq(grants.id, first.grantId));
  assert.equal(old!.status, "revoked");
  const disabled = await DelegationManager.read.disabledDelegations({
    client: testnet.client,
    contractAddress: DELEGATION_FRAMEWORK.delegationManager,
    delegationHash: hashDelegation(old!.delegation as never),
  });
  assert.equal(disabled, true, "the DelegationManager has disabled the replaced grant");
  const [current] = await db.select().from(grants).where(eq(grants.id, second.grantId));
  assert.equal(current!.status, "active");
  const stillOn = await DelegationManager.read.disabledDelegations({
    client: testnet.client,
    contractAddress: DELEGATION_FRAMEWORK.delegationManager,
    delegationHash: hashDelegation(current!.delegation as never),
  });
  assert.equal(stillOn, false, "the new grant still works");

  // A third request offers the second grant (now the live one) for revoke; the first is already off.
  const third = (await (await call("POST", "/marketplace/agent-wallet/grant", {})).json()) as GrantRequest;
  assert.ok(third.revoke, "the second grant is now the live one to replace");
  console.log("marketplace grant replaced on chain", { revokedGrant: first.grantId });
});
