// A refused microphone keeps the voice session; any other error ends it. The shapes are the ones the libraries raise:
// react-native-webrtc's MediaStreamError (a plain object, not an Error) and the browser's DOMException.
import assert from "node:assert/strict";
import { test } from "node:test";

import { isMicrophoneFailure } from "../src/voice/mic-failure";

const named = (name: string, message = "") => Object.assign(new Error(message), { name });

test("iOS and Android: react-native-webrtc's refused permission", () => {
  assert.equal(isMicrophoneFailure({ name: "SecurityError", message: "Permission denied." }), true);
});

test("browsers: refused, missing or busy microphone", () => {
  assert.equal(isMicrophoneFailure(named("NotAllowedError", "Permission denied")), true);
  assert.equal(isMicrophoneFailure(named("NotFoundError")), true);
  assert.equal(isMicrophoneFailure(named("NotReadableError")), true);
});

test("anything else still ends the session", () => {
  assert.equal(isMicrophoneFailure(named("ConnectionError", "could not establish signal connection")), false);
  assert.equal(isMicrophoneFailure(new Error("boom")), false);
  assert.equal(isMicrophoneFailure({ name: "DOMException", message: "AbortError" }), false);
  assert.equal(isMicrophoneFailure(undefined), false);
});
