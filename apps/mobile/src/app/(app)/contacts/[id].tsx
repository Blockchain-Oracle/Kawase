import { useLocalSearchParams } from "expo-router";

import { ContactScreen } from "@/screens/contact-screen";

export default function ContactRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContactScreen id={typeof id === "string" ? id : undefined} />;
}
