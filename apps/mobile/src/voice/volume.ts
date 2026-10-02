// A track's loudness, straight from LiveKit's native volume processor into a callback — no React state per tick, so
// the orb's shared value follows the voice without re-rendering the overlay 30 times a second. (LiveKit's own
// `useTrackVolume` does the same subscription but stores every reading in React state.)
import type { MediaStreamTrack } from "@livekit/react-native-webrtc";
import type { Track } from "livekit-client";
import * as React from "react";
import { NativeEventEmitter, NativeModules } from "react-native";

type VolumeModule = {
  createVolumeProcessor: (peerConnectionId: number, trackId: string) => string;
  deleteVolumeProcessor: (tag: string, peerConnectionId: number, trackId: string) => void;
};
const VOLUME_EVENT = "LK_VOLUME_PROCESSED";
const NO_PEER_CONNECTION = -1;

export function useVolume(track: Track | undefined, onVolume: (volume: number) => void) {
  const callback = React.useRef(onVolume);
  callback.current = onVolume;
  const media = track?.mediaStreamTrack as unknown as MediaStreamTrack | undefined;
  const peerConnectionId = (media as { _peerConnectionId?: number } | undefined)?._peerConnectionId ?? NO_PEER_CONNECTION;
  const trackId = media?.id;

  React.useEffect(() => {
    const native = NativeModules.LivekitReactNativeModule as (VolumeModule & object) | undefined;
    if (!native || !trackId) return;
    const tag = native.createVolumeProcessor(peerConnectionId, trackId);
    const subscription = new NativeEventEmitter(native as never).addListener(
      VOLUME_EVENT,
      (event: { id?: string; volume?: number }) => {
        if (event.id === tag && typeof event.volume === "number") callback.current(event.volume);
      },
    );
    return () => {
      subscription.remove();
      native.deleteVolumeProcessor(tag, peerConnectionId, trackId);
      callback.current(0);
    };
  }, [peerConnectionId, trackId]);
}
