// M12 (security review 2026-10-03): a leaked bearer token alone can neither approve a send (inside the allowance it
// goes at once) nor delete the account. Those requests carry the person's own wallet signature (Privy, D41) over an
// activity id naming this exact request; the signature must recover to the wallet registered for the account, the time
// be recent, the hash this request, and each proof is used once. Runs against the local database, no chain.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sha256, stringToBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import { PROOF_ACTIVITY_HEADER, PROOF_SIGNATURE_HEADER, proofActivity } from "../src/auth/device-proof";
import { deleteUser, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

const OLD_PROOF_MS = 10 * 60_000;
const wallet = privateKeyToAccount(generatePrivateKey());
const person = privyPerson(`proof-${randomUUID()}@example.test`, wallet.address);
const required = testApp(undefined, undefined, undefined, undefined, undefined, undefined, { deviceProofRequired: true });
const optional = testApp();
const userIds: string[] = [];
after(async () => {
  for (const id of userIds) await deleteUser(required.db, id);
  await required.close();
  await optional.close();
});

async function signIn(app: typeof required.app) {
  const response = await privySignIn(app, person, { platform: "ios", installationId: "proof-phone" });
  assert.equal(response.status, 201);
  const signedIn = (await response.json()) as { token: string; user: { id: string } };
  if (!userIds.includes(signedIn.user.id)) userIds.push(signedIn.user.id);
  return signedIn.token;
}

/** A request as the app sends it, with the proof signed by `signer` over `proved` (by default this very request). */
async function proven(token: string, path: string, payload: unknown, signer: PrivateKeyAccount = wallet, proved?: { path: string; body: string }, at = Date.now()) {
  const body = JSON.stringify(payload);
  const activity = proofActivity("POST", proved?.path ?? path, proved?.body ?? body, at);
  const request = jsonRequest("POST", payload, token);
  return {
    ...request,
    headers: { ...(request.headers as Record<string, string>), [PROOF_ACTIVITY_HEADER]: activity, [PROOF_SIGNATURE_HEADER]: await signer.signMessage({ message: activity }) },
  };
}

const typeOf = async (response: Response) => ((await response.json()) as { type: string }).type.split("/").pop();

test("required: no proof, another wallet, another request, an old proof or a replay is refused; the person's own goes on", async () => {
  const { app } = required;
  const token = await signIn(app);
  const approve = `/sends/${randomUUID()}/approve`;

  const bare = await app.request(approve, jsonRequest("POST", { version: 1 }, token));
  assert.equal(bare.status, 403);
  assert.equal(await typeOf(bare), "device_proof_required");
  const deletion = await app.request("/account/delete", jsonRequest("POST", { confirm: "nope" }, token));
  assert.equal(deletion.status, 403, "deleting the account needs it too");

  const stranger = privateKeyToAccount(generatePrivateKey());
  assert.equal((await app.request(approve, await proven(token, approve, { version: 1 }, stranger))).status, 401, "a wallet that is not the account's");
  assert.equal((await app.request(approve, await proven(token, approve, { version: 1 }, wallet, { path: approve, body: JSON.stringify({ version: 2 }) }))).status, 401, "a proof for another request");
  assert.equal((await app.request(approve, await proven(token, approve, { version: 1 }, wallet, undefined, Date.now() - OLD_PROOF_MS))).status, 401, "an old proof");

  const good = await proven(token, approve, { version: 1 });
  const passed = await app.request(approve, good);
  assert.equal(passed.status, 404, "past the proof, the send itself is looked up (none here)");
  assert.equal((await app.request(approve, good)).status, 401, "the same proof twice");
  assert.equal((await app.request("/account/delete", await proven(token, "/account/delete", { confirm: "nope" }))).status, 422, "past the proof, the confirmation is checked");
});

test("not yet required: requests without a proof go on as before (old app builds)", async () => {
  const { app } = optional;
  const token = await signIn(app);
  const approve = `/sends/${randomUUID()}/approve`;
  assert.equal((await app.request(approve, jsonRequest("POST", { version: 1 }, token))).status, 404);
  const stranger = privateKeyToAccount(generatePrivateKey());
  assert.equal((await app.request(approve, await proven(token, approve, { version: 1 }, stranger))).status, 404, "a proof that does not hold is only logged");
});

test("the app's proof format is the api's: the same activity id for the same request (apps/mobile session/device-proof.ts)", () => {
  const body = JSON.stringify({ id: randomUUID(), message: { role: "user", parts: [{ type: "text", text: "send 5 to mum — ça va?" }] } });
  const at = Date.now();
  // What the app computes (viem, as on the phone) and what the api checks (node's crypto) must agree byte for byte.
  const app = `kawase:${at}:${sha256(stringToBytes(`POST /agent/chat\n${body}`)).slice(2)}`;
  assert.equal(proofActivity("POST", "/agent/chat", body, at), app);
});
