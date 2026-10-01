import { RequestScreen } from "@/screens/request-screen";

/** `/request` asks for money with a link; `/request?id=…` opens one request (from the inbox). */
export default function RequestRoute() {
  return <RequestScreen />;
}
