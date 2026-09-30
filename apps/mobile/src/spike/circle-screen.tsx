import { Text, View } from 'react-native';

// Circle's React Native SDK is a native module with no web build, so this screen only exists on iOS and Android.
export function CircleScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text>The Circle SDK spike runs in the native app only.</Text>
    </View>
  );
}
