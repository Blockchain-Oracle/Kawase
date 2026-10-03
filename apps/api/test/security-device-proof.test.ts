// M12 (security review 2026-10-03): a leaked bearer token alone can neither approve a send (inside the allowance it
// goes at once) nor delete the account. Those requests carry a Turnkey stamp from the device's own session key over
// this exact request; the key must be the one the device signed in with (or one Turnkey lists for the person now,
// after a session renewal), the time recent, the hash this request, and each proof is used once. Runs against the
// local database, no chain.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { sha256, stringToBytes } from "viem";

import { devices } from "@kawase/db";

import { PROOF_BODY_HEADER, PROOF_STAMP_HEADER, proofActivity } from "../src/auth/device-proof";
import { deleteUser, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

const SUB_ORG = randomUUID();
const TURNKEY_USER = randomUUID();
const deviceKey = turnkeyStyleKeyPair();
const record = { userId: TURNKEY_USER, userName: "proof", email: `proof-${SUB_ORG}@example.test`, sessionPublicKeys: [deviceKey.publicKeyHex] };
const turnkey = fakeTurnkey({ [`${SUB_ORG}/${TURNKEY_USER}`]: record });
const required = testApp(turnkey, undefined, undefined, undefined, undefined, undefined, undefined, { deviceProofRequired: true });
const optional = testApp(turnkey);
let userId = "";
after(async () => {
  if (userId) await deleteUser(required.db, userId);
  await required.close();
  await optional.close();
});

async function signIn(app: typeof required.app) {
  const { nonce } = (await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string };
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const response = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, deviceKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "proof-phone" } }));
  assert.equal(response.status, 201);
  const signedIn = (await response.json()) as { token: string; user: { id: string } };
  userId = signedIn.user.id;
  return signedIn.token;
}

/** A request as the app sends it, with the proof stamped by `key` over `proved` (by default this very request). */
async function proven(token: string, path: string, payload: unknown, key = deviceKey, proved?: { path: string; body: string }, at = Date.now()) {
  const body = JSON.stringify(payload);
  const signed = JSON.stringify({ organizationId: SUB_ORG, activityId: proofActivity("POST", proved?.path ?? path, proved?.body ?? body, at) });
  const request = jsonRequest("POST", payload, token);
  return { ...request, headers: { ...(request.headers as Record<string, string>), [PROOF_BODY_HEADER]: signed, [PROOF_STAMP_HEADER]: await stampBody(signed, key) } };
}

const typeOf = async (response: Response) => ((await response.json()) as { type: string }).type.split("/").pop();

test("required: no proof, someone else's key, another request or a replay is refused; the device's own goes on", async () => {
  const { app } = required;
  const token = await signIn(app);
  const approve = `/sends/${randomUUID()}/approve`;

  const bare = await app.request(approve, jsonRequest("POST", { version: 1 }, token));
  assert.equal(bare.status, 403);
  assert.equal(await typeOf(bare), "device_proof_required");
  const deletion = await app.request("/account/delete", jsonRequest("POST", { confirm: "nope" }, token));
  assert.equal(deletion.status, 403, "deleting the account needs it too");

  assert.equal((await app.request(approve, await proven(token, approve, { version: 1 }, turnkeyStyleKeyPair()))).status, 401, "a key that is not this device's");
  assert.equal((await app.request(approve, await proven(token, approve, { version: 1 }, deviceKey, { path: approve, body: JSON.stringify({ version: 2 }) }))).status, 401, "a proof for another request");
  assert.equal((await app.request(approve, await proven(token, approve, { version: 1 }, deviceKey, undefined, Date.now() - 10 * 60_000))).status, 401, "an old proof");

  const good = await proven(token, approve, { version: 1 });
  const passed = await app.request(approve, good);
  assert.equal(passed.status, 404, "past the proof, the send itself is looked up (none here)");
  assert.equal((await app.request(approve, good)).status, 401, "the same proof twice");

  // A renewed Turnkey session: a new key Turnkey lists for the person holds, and the device remembers it.
  const renewed = turnkeyStyleKeyPair();
  record.sessionPublicKeys.push(renewed.publicKeyHex);
  assert.equal((await app.request("/account/delete", await proven(token, "/account/delete", { confirm: "nope" }, renewed))).status, 422, "past the proof, the confirmation is checked");
  const [device] = await required.db.select({ key: devices.turnkeyPublicKey }).from(devices).where(eq(devices.userId, userId));
  assert.equal(device!.key, renewed.publicKeyHex);
});

test("not yet required: requests without a proof go on as before (old app builds)", async () => {
  const { app } = optional;
  const token = await signIn(app);
  const approve = `/sends/${randomUUID()}/approve`;
  assert.equal((await app.request(approve, jsonRequest("POST", { version: 1 }, token))).status, 404);
  assert.equal((await app.request(approve, await proven(token, approve, { version: 1 }, turnkeyStyleKeyPair()))).status, 404, "a proof that does not hold is only logged");
});

test("the app's proof format is the api's: the same activity id for the same request (apps/mobile session/device-proof.ts)", () => {
  const body = JSON.stringify({ id: randomUUID(), message: { role: "user", parts: [{ type: "text", text: "send 5 to mum — ça va?" }] } });
  const at = Date.now();
  // What the app computes (viem, as on the phone) and what the api checks (node's crypto) must agree byte for byte.
  const app = `kawase:${at}:${sha256(stringToBytes(`POST /agent/chat\n${body}`)).slice(2)}`;
  assert.equal(proofActivity("POST", "/agent/chat", body, at), app);
});
