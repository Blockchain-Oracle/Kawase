import { createApiClient } from "@kawase/api-client";

import { deviceProofHeaders } from "./device-proof";
import { sessionStorage } from "./storage";

/** The api's address: the Coolify deployment, or a local api set with EXPO_PUBLIC_API_URL. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://kawase-api.84.46.247.92.sslip.io";

export const api = createApiClient({ baseUrl: API_URL, getToken: () => sessionStorage.getToken(), prove: deviceProofHeaders });
