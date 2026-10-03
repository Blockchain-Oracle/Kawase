import { useRouter } from "expo-router";

import { Scanner } from "@/scan/scanner";

/** `/scan`: scan to pay, from the fan (an address opens Send filled in, a Kawase link its pay page). */
export default function ScanRoute() {
  const router = useRouter();
  return <Scanner origin="fan" onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
