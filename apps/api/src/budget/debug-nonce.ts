import { config } from "dotenv";

import { fakeTurnkey, testApp } from "../../test/helpers";

config({ path: new URL("../../../../.env", import.meta.url).pathname, quiet: true });
const { app, close } = testApp(fakeTurnkey({}, {}));
const response = await app.request("/auth/nonce", { method: "POST" });
console.log(response.status, (await response.text()).slice(0, 300));
await close();
