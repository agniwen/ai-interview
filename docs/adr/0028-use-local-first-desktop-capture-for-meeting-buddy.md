---
status: accepted
---

# Use local-first desktop capture for Meeting Buddy

Meeting Buddy records microphone and system audio as separate local tracks in the Electron desktop app, without adding a Bot to the meeting. The local recording is authoritative while capture is active; live transcription is a best-effort AI-provider view and may fail without affecting the recording. When the user chooses “结束并保存”, the desktop app uploads the verified recording directly to the workspace recording object store, after which the backend queues final transcription and meeting-intelligence generation.

The Hono web/API process is a control plane for authentication, permissions, upload manifests, signed object-store requests, state transitions, and query APIs. It does not proxy hour-long audio streams. Meeting Buddy owns a separate meeting-session domain and canonical transcript model rather than reusing AI-interview conversations, LiveKit rooms, or a provider's response schema. Transcription and intelligence providers remain replaceable adapters selected within the workspace administrator's provider policy.

This shape matches the existing Electron, PostgreSQL, BullMQ, recording R2, and Mastra foundations; survives network and provider failures during recording; and works across desktop meeting applications. Bot participation, browser extensions, unattended recording, platform-native recording imports, screen capture, and on-device models remain later adapters rather than MVP prerequisites.

## Consequences

- The desktop app must own permissions, dual-track capture, a durable local spool, crash recovery, and verified cleanup.
- Saving requires resumable direct upload and idempotent server-side processing before a meeting becomes ready.
- A user must be present on the recording computer and manually start the capture.
- Sharing and administrator access apply to saved workspace artifacts, not to an active local capture.
