// The phone ledger's storage on the device: AsyncStorage (localStorage on the web). Kept apart from ledger.ts so the
// ledger and the guard stay plain modules the tests can run without React Native.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { createPhoneLedger } from "./ledger";

export const phoneLedger = createPhoneLedger({
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
});
