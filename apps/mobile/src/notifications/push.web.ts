// The web has no push (D31: email and the inbox reach people in a browser); the same calls answer "unavailable".
export type PushState = "on" | "off" | "denied" | "unavailable";

export const pushState = async (): Promise<PushState> => "unavailable";
export const registerPushToken = async () => false;
export const turnOnPush = async (): Promise<PushState> => "unavailable";
export const forgetPushToken = async () => undefined;
export const pathOf = (): string | undefined => undefined;
export const useLastNotificationResponse = (): null => null;
