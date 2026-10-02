// Globals the native runtime lacks, installed by the entry (`index.ts`) before any other module runs.
// Secure random bytes for Turnkey's session keys and every other `crypto.getRandomValues` caller.
import "react-native-get-random-values";
