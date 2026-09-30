// The wallet flow through the api on Arc testnet with a fresh local key standing in for the Turnkey wallet:
// register → relayed 7702 setup → allowance signed and verified → status → revoke (funded by the ops wallet).
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import type { Hex, TransactionSerializable, TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(
  process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY,
);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];

test(
  "register, set up, accept an allowance and revoke it on Arc testnet",
  { skip: !live, timeout: 300_000 },
  async () => {
    const env = loadApiEnv();
    const chains = createChains(env);
    const wallet = privateKeyToAccount(generatePrivateKey());
    const SUB_ORG = randomUUID();
    const TURNKEY_USER = randomUUID();
    const sessionKey = turnkeyStyleKeyPair();
    const turnkey = fakeTurnkey(
      {
        [`${SUB_ORG}/${TURNKEY_USER}`]: {
          userId: TURNKEY_USER,
          userName: "kenji",
          email: `kenji-${SUB_ORG}@example.test`,
          sessionPublicKeys: [sessionKey.publicKeyHex],
        },
      },
      { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
    );
    const { app, db, close } = testApp(turnkey, chains);
    const device = { platform: "ios", installationId: "testnet-phone-0001" };
    let userId = "";
    after(async () => {
      if (userId) await deleteUser(db, userId);
      await close();
    });

    const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
    const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
    const signIn = await app.request(
      "/auth/turnkey",
      jsonRequest("POST", {
        proof: { body, stamp: await stampBody(body, sessionKey) },
        turnkeyUserId: TURNKEY_USER,
        device,
      }),
    );
    await expectStatus(signIn, 201, "sign-in");
    const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
    userId = user.id;

    const wrongWallet = await app.request(
      "/wallet",
      jsonRequest("POST", { address: wallet.address, walletId: "not-mine" }, token),
    );
    assert.equal(wrongWallet.status, 422, "an address that is not in the sub-organization is refused");
    const registered = await app.request(
      "/wallet",
      jsonRequest("POST", { address: wallet.address, walletId: "wallet-1" }, token),
    );
    await expectStatus(registered, 201, "register");

    const notReady = await app.request("/wallet/allowance/request", jsonRequest("POST", { network: "testnet" }, token));
    assert.equal(notReady.status, 422, "no allowance before the setup");

    const setupRequest = await app.request("/wallet/setup/request", jsonRequest("POST", { network: "testnet" }, token));
    await expectStatus(setupRequest, 200, "setup request");
    const { authorization } = (await setupRequest.json()) as {
      authorization: { contractAddress: Hex; chainId: number; nonce: number };
    };
    const signed = await wallet.signAuthorization(authorization);
    const setupSubmit = await app.request(
      "/wallet/setup/submit",
      jsonRequest(
        "POST",
        {
          network: "testnet",
          authorization: {
            address: signed.address,
            chainId: signed.chainId,
            nonce: signed.nonce,
            r: signed.r,
            s: signed.s,
            yParity: signed.yParity,
          },
        },
        token,
      ),
    );
    await expectStatus(setupSubmit, 200, "setup submit");
    assert.equal(((await setupSubmit.json()) as { setUp: boolean }).setUp, true);
    const again = await app.request("/wallet/setup/request", jsonRequest("POST", { network: "testnet" }, token));
    assert.equal(((await again.json()) as { alreadySetUp: boolean }).alreadySetUp, true);

    const allowanceRequest = await app.request(
      "/wallet/allowance/request",
      jsonRequest("POST", { network: "testnet" }, token),
    );
    await expectStatus(allowanceRequest, 200, "allowance request");
    const { grantId, typedData, receipt } = (await allowanceRequest.json()) as {
      grantId: string;
      typedData: TypedDataDefinition;
      receipt: { amountPerPeriod: string; periodSeconds: number };
    };
    assert.equal(receipt.periodSeconds, 86_400, "a daily allowance");
    const badSignature = await app.request(
      "/wallet/allowance/submit",
      jsonRequest("POST", { grantId, signature: `0x${"11".repeat(65)}` }, token),
    );
    assert.equal(badSignature.status, 422);
    const signature = await wallet.signTypedData(typedData);
    const allowanceSubmit = await app.request(
      "/wallet/allowance/submit",
      jsonRequest("POST", { grantId, signature }, token),
    );
    await expectStatus(allowanceSubmit, 200, "allowance submit");

    const status = await app.request("/wallet", { headers: { authorization: `Bearer ${token}` } });
    await expectStatus(status, 200, "status");
    const view = (await status.json()) as {
      address: string;
      networks: { testnet: { setUp: boolean; allowance: { id: string } | null; usdcBalance: string } };
    };
    assert.equal(view.address, wallet.address);
    assert.equal(view.networks.testnet.setUp, true);
    assert.equal(view.networks.testnet.allowance?.id, grantId);

    // Gas for the revoke: a little USDC from the ops wallet (a faucet drip in the product).
    const circle = initiateDeveloperControlledWalletsClient({
      apiKey: env.CIRCLE_TEST_API_KEY,
      entitySecret: env.CIRCLE_TEST_ENTITY_SECRET,
    });
    const network = getNetwork("testnet");
    const drip = await circle.createTransaction({
      walletAddress: env.OPS_WALLET_ADDRESS_TESTNET,
      blockchain: network.circleBlockchain,
      tokenAddress: network.addresses.usdc,
      destinationAddress: wallet.address,
      amount: ["0.05"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) break;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }

    const revokeRequest = await app.request(
      "/wallet/allowance/revoke/request",
      jsonRequest("POST", { network: "testnet" }, token),
    );
    await expectStatus(revokeRequest, 200, "revoke request");
    const { requestId, transaction } = (await revokeRequest.json()) as {
      requestId: string;
      transaction: {
        chainId: number;
        nonce: number;
        to: Hex;
        data: Hex;
        value: string;
        gas: string;
        maxFeePerGas: string;
        maxPriorityFeePerGas: string;
      };
    };
    const unsigned: TransactionSerializable = {
      type: "eip1559",
      chainId: transaction.chainId,
      nonce: transaction.nonce,
      to: transaction.to,
      data: transaction.data,
      value: BigInt(transaction.value),
      gas: BigInt(transaction.gas),
      maxFeePerGas: BigInt(transaction.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
    };
    const tampered = await wallet.signTransaction({ ...unsigned, data: "0x" });
    assert.equal(
      (
        await app.request(
          "/wallet/transactions/submit",
          jsonRequest("POST", { requestId, signedTransaction: tampered }, token),
        )
      ).status,
      422,
    );
    const signedTransaction = await wallet.signTransaction(unsigned);
    const submit = await app.request(
      "/wallet/transactions/submit",
      jsonRequest("POST", { requestId, signedTransaction }, token),
    );
    await expectStatus(submit, 200, "revoke submit");
    assert.equal(((await submit.json()) as { status: string }).status, "confirmed");

    const afterRevoke = (await (
      await app.request("/wallet", { headers: { authorization: `Bearer ${token}` } })
    ).json()) as { networks: { testnet: { allowance: unknown } } };
    assert.equal(afterRevoke.networks.testnet.allowance, null, "the allowance is revoked");
  },
);
