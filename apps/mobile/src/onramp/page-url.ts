// Where Kawase's web app is served, for the buy page (`/buy/:orderId`). The api builds the full URL with the order's key
// when it starts a purchase (`pageUrl`); this is only for a deep link into the page with no start response in hand.
export const WEB_APP_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.getkawase.xyz").replace(/\/$/, "");

export const buyPageUrl = (orderId: string, key?: string | undefined) => `${WEB_APP_URL}/buy/${encodeURIComponent(orderId)}${key ? `#k=${key}` : ""}`;
