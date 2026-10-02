import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError, createApiClient } from "../src/index";

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  return (async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch;
}

test("sends the token and the body, and returns the parsed response", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const client = createApiClient({
    baseUrl: "https://api.test/",
    getToken: () => "tok",
    fetch: fakeFetch((url, init) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ user: { id: "u1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  });
  const result = await client.me.setNetwork("testnet");
  assert.equal(result.user.id, "u1");
  assert.equal(seen[0]?.url, "https://api.test/me/network");
  assert.equal(seen[0]?.init.method, "PUT");
  assert.equal((seen[0]?.init.headers as Record<string, string>).authorization, "Bearer tok");
  assert.equal(seen[0]?.init.body, JSON.stringify({ network: "testnet" }));
});

test("a problem+json response becomes an ApiError with the code", async () => {
  const client = createApiClient({
    baseUrl: "https://api.test",
    getToken: () => undefined,
    fetch: fakeFetch(
      () =>
        new Response(JSON.stringify({ type: "https://kawase.xyz/problems/nonce_invalid", title: "x", status: 401 }), {
          status: 401,
          headers: { "content-type": "application/problem+json" },
        }),
    ),
  });
  await assert.rejects(
    client.me.get(),
    (error: ApiError) => error instanceof ApiError && error.code === "nonce_invalid" && error.status === 401,
  );
});

test("a guest token can be passed for the upgrade call, and 204 yields undefined", async () => {
  let authorization = "";
  const client = createApiClient({
    baseUrl: "https://api.test",
    getToken: () => "session",
    fetch: fakeFetch((url, init) => {
      authorization = (init.headers as Record<string, string>).authorization ?? "";
      return url.endsWith("/sign-out")
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ token: "t", user: {} }), { status: 201 });
    }),
  });
  await client.auth.turnkey(
    { proof: { body: "b", stamp: "s" }, turnkeyUserId: "u", device: { platform: "ios", installationId: "12345678" } },
    "guest",
  );
  assert.equal(authorization, "Bearer guest");
  assert.equal(await client.auth.signOut(), undefined);
});

test("sign-in tracing shares an attempt identity without changing the signed proof or session token", async () => {
  const requests: RequestInit[] = [];
  const client = createApiClient({
    baseUrl: "https://api.test",
    getToken: () => "account",
    fetch: fakeFetch((_, init) => {
      requests.push(init);
      return new Response("{}", { status: 200 });
    }),
  });
  const attempt = "1a2b3c4d-1111-2222-3333-444444444444";
  const proof = { body: "signed-body", stamp: "signed-stamp" };
  await client.auth.nonce(attempt);
  await client.auth.turnkey(
    { proof, turnkeyUserId: "user", device: { platform: "ios", installationId: "phone-id" } },
    "guest",
    attempt,
  );
  await client.me.get(attempt);
  await client.wallet.register({ address: "address", walletId: "wallet" }, attempt);
  assert.ok(
    requests.every((request) => (request.headers as Record<string, string>)["x-kawase-auth-attempt"] === attempt),
  );
  assert.equal((requests[1]!.headers as Record<string, string>).authorization, "Bearer guest");
  assert.deepEqual(JSON.parse(requests[1]!.body as string).proof, proof);
});
