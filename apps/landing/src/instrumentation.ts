// Next calls `register` once per server, before it serves a request: the TestFlight gate starts here, outside every
// render, so its reads of Apple's page are plain fetches even when `/`'s regeneration asks for one
// (`server/store-release.ts`).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startTestflightGate } = await import("./server/store-release");
  startTestflightGate();
}
