// Bevel's corner card: on a desktop, a small QR in the bottom corner the whole way down, "Get Kawase on your phone", so a
// visitor with a laptop open and a phone in hand is one scan from the app. Drawn on the server; the client part shows it
// once the hero has scrolled away and lets it be closed (for the visit). Hidden on phones and narrow windows.
import { links } from "@/lib/links";
import { qrSvg } from "@/lib/qr";

import { CornerCard } from "./corner-card";

export async function CornerQr() {
  const svg = await qrSvg(`${links.landing}/download`);
  return <CornerCard svg={svg} />;
}
