import { Text, View } from 'react-native';

// The direction previews use web (DOM) components, so they only render in the web build.
export function DirectionsPreview() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text>Open /dev/directions in the web build to compare the design directions.</Text>
    </View>
  );
}
