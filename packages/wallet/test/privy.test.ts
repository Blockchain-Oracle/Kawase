// The Privy adapter (privy.ts) against viem's own local account: with the same key behind `signHash`, every signature
// must be byte-for-byte what viem produces, whether the wallet returns v as 27/28 (what Privy's secp256k1_sign returned
// on Arc testnet, 2026-10-14) or 0/1. The live Arc testnet run (setup 0x26fd81d4…, redeem 0xbac10503…, send 0xc5942512…)
// is in the wallet lane report.
// Run: pnpm --filter @kawase/wallet exec tsx --test test/privy.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSignature, serializeSignature, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount, sign } from "viem/accounts";

import { DELEGATION_FRAMEWORK } from "@kawase/networks";

import { privySigner, SigningRefused } from "../src";

const key = generatePrivateKey();
const local = privateKeyToAccount(key);
const ARC_TESTNET = 5042002;

/** What Privy returns: a 65-byte hex signature, v as 27/28 (`legacy`) or 0/1. */
const signHashWith = (legacyV: boolean) => async (hash: Hex) => {
  const parts = await sign({ hash, privateKey: key });
  const { r, s } = parts;
  const yParity = parts.yParity ?? 0;
  return legacyV ? serializeSignature({ r, s, v: BigInt(yParity + 27) }) : serializeSignature({ r, s, yParity });
};

for (const legacyV of [true, false]) {
  const signer = privySigner({ address: local.address, signHash: signHashWith(legacyV), approval: "session" });
  const label = legacyV ? "v 27/28" : "v 0/1";

  test(`message matches viem (${label})`, async () => {
    assert.equal(await signer.signMessage({ message: "kawase" }), await local.signMessage({ message: "kawase" }));
  });

  test(`transaction matches viem (${label})`, async () => {
    const tx: TransactionSerializable = {
      type: "eip1559",
      chainId: ARC_TESTNET,
      nonce: 3,
      to: "0x3600000000000000000000000000000000000000",
      data: "0xa9059cbb",
      value: 0n,
      gas: 100_000n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
    };
    assert.equal(await signer.signTransaction(tx), await local.signTransaction(tx));
  });

  test(`authorization matches viem (${label})`, async () => {
    const request = { contractAddress: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator, chainId: ARC_TESTNET, nonce: 7 };
    const ours = await signer.signAuthorization(request);
    const theirs = await local.signAuthorization(request);
    assert.equal(ours.address, theirs.address);
    assert.equal(ours.r, theirs.r);
    assert.equal(ours.s, theirs.s);
    assert.equal(ours.yParity, theirs.yParity);
  });
}

test("plain typed data matches viem", async () => {
  const signer = privySigner({ address: local.address, signHash: signHashWith(true), approval: "session" });
  const typedData = {
    domain: { name: "Kawase", version: "1", chainId: ARC_TESTNET },
    types: { Note: [{ name: "text", type: "string" }] },
    primaryType: "Note" as const,
    message: { text: "hi" },
  };
  assert.equal(await signer.signTypedData(typedData), await local.signTypedData(typedData));
});

test("an authorization for another contract or chain is refused before signing", async () => {
  let asked = 0;
  const signer = privySigner({
    address: local.address,
    signHash: async (hash) => {
      asked += 1;
      return signHashWith(true)(hash);
    },
    approval: "session",
  });
  await assert.rejects(
    signer.signAuthorization({ contractAddress: local.address, chainId: ARC_TESTNET, nonce: 0 }),
    SigningRefused,
  );
  await assert.rejects(
    signer.signAuthorization({ contractAddress: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator, chainId: 1, nonce: 0 }),
    SigningRefused,
  );
  assert.equal(asked, 0);
});

test("passkey approval runs the app's confirm before every signature, and a refusal stops it", async () => {
  let confirms = 0;
  const signer = privySigner({
    address: local.address,
    signHash: signHashWith(true),
    approval: "passkey",
    confirm: async () => {
      confirms += 1;
      if (confirms > 1) throw new Error("cancelled");
    },
  });
  const signature = await signer.signMessage({ message: "one" });
  assert.equal(parseSignature(signature).yParity !== undefined, true);
  await assert.rejects(signer.signMessage({ message: "two" }), /cancelled/);
  assert.equal(confirms, 2);
});
