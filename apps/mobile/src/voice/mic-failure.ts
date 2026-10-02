// A refused or missing microphone is not a failed voice session. LiveKitRoom reports it through `onError`, but the
// room stays connected and Kawase can still speak; the conversation says how to allow the microphone, with typing
// beside it. Only a real connection error should end the session with "try again". How each platform reports it:
// - browsers: getUserMedia's DOMException (NotAllowedError refused, NotFoundError none, NotReadableError in use),
//   which livekit-client's MediaDeviceFailure.getFailure classifies;
// - iOS and Android: @livekit/react-native-webrtc asks for the permission first and, when it is refused, rejects with
//   its own MediaStreamError named "SecurityError" ("Permission denied.", src/getUserMedia.ts). getFailure calls any
//   other name "Other", so this one is matched by name.
import { MediaDeviceFailure } from "livekit-client";

const REFUSALS: ReadonlySet<MediaDeviceFailure> = new Set([
  MediaDeviceFailure.PermissionDenied,
  MediaDeviceFailure.NotFound,
  MediaDeviceFailure.DeviceInUse,
]);
/** react-native-webrtc's name for a refused microphone permission (iOS and Android). */
const NATIVE_REFUSAL = "SecurityError";

export function isMicrophoneFailure(error: unknown): boolean {
  if (error && typeof error === "object" && "name" in error && error.name === NATIVE_REFUSAL) return true;
  const failure = MediaDeviceFailure.getFailure(error);
  return failure !== undefined && REFUSALS.has(failure);
}
