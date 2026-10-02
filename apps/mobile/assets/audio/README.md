# Interface confirmation sound

`confirmed.wav` is a 0.5-second mono PCM effect generated with ElevenLabs Sound Effects v2 on 2026-10-02. Prompt: a quiet, soft rounded two-tone confirmation chime, warm and reassuring, without voice, music, harsh clicks or alarms.

The generated MP3 was converted to 44.1 kHz mono WAV with loudness normalization (`I=-26`, `TP=-9`, `LRA=3`), another -3 dB of gain, and a 140 ms fade out. It has been decode-checked; listening and physical-device silent-mode/Bluetooth acceptance remain open.

Interface sounds default off, haptics default on. Both have persistent independent switches. Confirmed feedback uses a stable result identity, stays silent during communication audio, and never replays when an old sent card opens. Local audio and communication startup are serialized. Narration is still pending the accepted speech configuration and localized bundled assets; it must remain opt-in.
