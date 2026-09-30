import { Text, View } from 'react-native';

// The wallet spike uses Turnkey's React Native kit, which is native-only.
export function WalletScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text>The wallet spike runs in the native app only.</Text>
    </View>
  );
}
