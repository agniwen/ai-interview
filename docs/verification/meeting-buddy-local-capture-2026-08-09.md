# Meeting Buddy local capture verification

This document records the evidence boundary for issues #70 and #71. It contains
no recorded audio, candidate information, credentials, or transcripts.

## Production implementation checks

| Check                  | Result                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop unit tests     | Passed: local dual-track lifecycle, silence recovery, ordered save, restart recovery, both Save/Discard race orders, and stale-lock reconciliation              |
| Desktop TypeScript     | Passed for the Electron main/preload and renderer projects                                                                                                      |
| Production package     | Electron 39.8.10 arm64 unpacked application built successfully                                                                                                  |
| macOS privacy strings  | `NSMicrophoneUsageDescription` and `NSAudioCaptureUsageDescription` are present in the packaged `Info.plist`                                                    |
| Local-only boundary    | Capture begin, fragment append, save intent, recovery, and discard use the desktop `userData` filesystem; no backend, R2, or provider call is part of this path |
| Code-sign verification | Passed after temporary ad-hoc signing with `codesign --verify --deep --strict`; no Developer ID identity was available                                          |
| Packaged launch        | The ad-hoc packaged process remained running during a five-second launch smoke check                                                                            |

## WebM stream evidence

The implementation deliberately models each track as an ordered MediaRecorder
stream, not as independently decodable fragment files. A prior throwaway macOS
prototype at commit `a216375a` captured a real Electron 39.8.10 run and found:

- sequence 0 decoded independently;
- later 15-second timeslices lacked EBML headers;
- concatenating the fragments in sequence decoded through 146.34 seconds;
- 20 fragments (10 per track) passed ordering and SHA-256 verification.

The production interface test therefore feeds a header-bearing WebM prefix
followed by a headerless Cluster continuation and verifies that the saved result
remains `ordered-mediarecorder-stream` with
`independentlyDecodableFragments: false`.

## Validation boundary

The production package has not repeated the full interactive microphone and
system-audio capture matrix after the implementation commit. The real-device
dual-track evidence above belongs to the prototype, while the production build
currently proves compilation, packaging, privacy metadata, ad-hoc signature
integrity, launchability, and deterministic storage behavior. Developer ID
signing/notarization, a 60-minute bounded-memory run, permission denial and
revocation, physical network loss, wired headset, AirPods, and interactive
capture in Tencent Meeting and DingTalk remain release validation work.
