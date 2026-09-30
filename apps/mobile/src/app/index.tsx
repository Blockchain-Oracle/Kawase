// Build index (temporary): the product's home screen arrives with the agent and voice stages. Until then
// this lists the internal screens.
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { Link, type Href } from "expo-router";
import { View } from "react-native";

const SCREENS: { href: Href; label: string }[] = [
  { href: "/dev/gallery", label: "Component gallery" },
  { href: "/dev/home-sample", label: "Home screen sample" },
  { href: "/spike-wallet", label: "Wallet spike (16)" },
];

export default function BuildIndex() {
  return (
    <View className="bg-background flex-1 justify-center gap-3 px-6">
      <Text className="font-display text-[32px] font-semibold leading-10">Kawase 為替</Text>
      <Text className="text-muted-foreground pb-4 text-sm">Build preview. These screens are internal.</Text>
      {SCREENS.map((screen) => (
        <Link key={screen.label} href={screen.href} asChild>
          <Button variant="secondary" className="h-12">
            <Text>{screen.label}</Text>
          </Button>
        </Link>
      ))}
    </View>
  );
}
