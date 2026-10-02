// The app's config is app.json; this adds what must not be committed. Firebase's google-services.json (Android push,
// Stage 9) comes from the EAS secret file variable GOOGLE_SERVICES_JSON in cloud builds (EAS writes the file and puts
// its path in the variable) and from ~/.config/kawase on this Mac for local builds (docs.expo.dev/eas/environment-variables/faq).
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

const LOCAL_GOOGLE_SERVICES = join(homedir(), ".config", "kawase", "google-services.json");

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (existsSync(LOCAL_GOOGLE_SERVICES) ? LOCAL_GOOGLE_SERVICES : undefined);
  return {
    ...config,
    name: config.name ?? "Kawase",
    slug: config.slug ?? "kawase",
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
