// `/`, rebuilt 10-15 (the owner: the banner's look, Mitoshi's structure, 3D, "an app ecosystem in a single
// application", and say we have a mobile app). The hero as the banner with the devices in 3D, the live tape of Arc's
// trending tokens, every app inside the app with where it runs, the tour on one pinned phone, safety, the transactions
// that prove it, and every way to get it. Regenerated every minute: the tape's prices and TestFlight's state (read from
// Apple's join page, `server/store-release.ts`) are at most that old.
import { CornerQr } from "@/components/landing/corner-qr";
import { Ecosystem } from "@/components/landing/ecosystem";
import { GetApp } from "@/components/landing/get-app";
import { Hero } from "@/components/landing/hero";
import { Proof } from "@/components/landing/proof";
import { Safety } from "@/components/landing/safety";
import { Tape } from "@/components/landing/tape";
import { Tour } from "@/components/landing/tour";
import { liveStoreRelease } from "@/server/store-release";

export const revalidate = 60;

export default async function Home() {
  const release = await liveStoreRelease();
  return (
    <>
      <Hero />
      <Tape />
      <Ecosystem />
      <Tour />
      <Safety />
      <Proof />
      <GetApp release={release} />
      <CornerQr />
    </>
  );
}
