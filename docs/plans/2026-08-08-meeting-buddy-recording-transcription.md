# Meeting Buddy 会议录制、转录与智能纪要实施方案

> 状态：设计已确认，尚未实现。
>
> 本方案只定义实施边界、模块归属、数据契约、交付顺序与验收标准；不代表当前代码已经具备录制或转录能力。

## Goal

在现有 Meeting Buddy Electron 应用中交付通用会议录制能力：用户在 macOS 上手动开始录制，应用分别捕获麦克风和系统音频，在本地可靠落盘并显示实时草稿；用户点击“结束并保存”后，将录音直传到工作区对象存储，异步生成最终转录、可修订逐字稿、结构化纪要和单场会议问答。

招聘台只是可选联动。每场会议可关联零个或一个候选人招聘记录，会议本身不依附于招聘流程。

## Source of truth

- [领域词汇](../../CONTEXT.md)
- [ADR-0028：Meeting Buddy 使用本地优先桌面采集](../adr/0028-use-local-first-desktop-capture-for-meeting-buddy.md)
- [会议录制、转录与智能纪要技术调研](../research/meeting-buddy-recording-transcription-architecture-2026-08-08.md)
- [Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer)

## Confirmed product decisions

以下决策已经由产品确认，实施时不得静默改变：

1. Meeting Buddy 是通用会议助手；招聘记录只是零或一个可选关联。
2. 主路径是 Electron 本机无 Bot 录制；用户必须在当前电脑参会并手动开始。
3. 首发优先支持 macOS；验收覆盖飞书、腾讯会议、钉钉、Zoom、Microsoft Teams、Google Meet 和普通浏览器音频。
4. 录制期间本地音频是唯一可靠事实源；断网、实时 STT 失败或服务端不可用不得中断录音。
5. 分别保存麦克风和系统音频。首版按一名本地说话人和一名远端说话人验收；领域模型允许远端多人 speaker label。
6. 会议中显示可修订的实时转录草稿；会后基于完整录音生成最终转录。
7. 用户点击“结束并保存”后立即进入后台上传；“结束并丢弃”是需要二次确认的次要动作。
8. 上传和服务端校验完成后，本地恢复副本继续保留 24 小时再清理。
9. 保存后的录音持续保留，直到 Owner 或工作区管理员删除；删除进入 7 天回收站后再永久清除。
10. 会议属于当前工作区。保存后默认创建者和工作区管理员可见；可分享给指定成员或整个工作区，不提供公开链接。
11. 会议权限分为 Owner、Editor、Viewer；工作区管理员拥有最高权限。
12. 支持手写 Meeting Note、机器最终稿、人工校正版和有版本的 Meeting Intelligence。
13. 首版内置 General Meeting 和 Recruiting Interview 两种纪要模板，不开放任意 Prompt 编辑。
14. 自动生成摘要、主题、决定、行动项和待确认问题；支持有 transcript 引用的单场会议问答。
15. 支持跨可见会议的普通全文搜索，不做跨会议 AI 问答。
16. 导出混合录音、Markdown 纪要、TXT 转录、SRT 字幕和 JSON 结构化数据。
17. 工作区管理员配置允许的 AI provider 和默认 provider；桌面端不保存长期 provider 密钥。
18. 单场最长 4 小时；每名用户同时只能录制一场；不支持后台无人值守录制。
19. 容量设计目标是 100 路实时转录、100 路并行对象存储直传、20 个并行最终转录任务。

## Non-goals

- 会议 Bot、用户不参会时的自动录制。
- Chrome Extension 或会议平台 DOM 注入。
- 自动检测会议、日历接入或自动开始录制。
- 屏幕、摄像头、共享 PPT、会议聊天或视频录制。
- 由 LLM 自动给出招聘录用结论或自动执行外部动作。
- 跨会议语义问答、个人长期记忆或工作区级会议 Agent。
- 首版内置 Whisper、Parakeet、Ollama 等端侧模型。
- 用现有 `interviewConversation`、`studioHumanInterviewMeeting` 或 LiveKit room 表示 Meeting Buddy 会议。

## Target architecture

```text
Electron renderer
  ├─ microphone getUserMedia ─┐
  ├─ system getDisplayMedia ──┼─> transferable audio chunks
  ├─ live transcript UI       │
  └─ meeting notes            │
                              v
Electron main process
  ├─ local spool + manifest + hashes
  ├─ crash/offline recovery
  ├─ 24-hour verified recovery copy
  ├─ direct signed upload ───────────────> Recording R2
  └─ provider-scoped live session ──────> Allowed STT provider

Hono control plane
  ├─ auth/workspace/meeting ACL
  ├─ capture lease + session state
  ├─ signed upload plan + manifest verification
  ├─ provider policy and short-lived provider authorization
  ├─ meeting query/share/search/export APIs
  └─ enqueue saved meeting
                  │
                  v
BullMQ Worker
  ├─ verify/finalize dual-track recording
  ├─ derive mixed playback asset
  ├─ final transcription + remote diarization
  ├─ canonical transcript revisions
  ├─ Meeting Intelligence revisions
  ├─ search-text projection
  └─ trash purge
                  │
          PostgreSQL + Recording R2
```

### Runtime boundaries

- **Renderer** owns browser media APIs and visible recording state. It must not own the only copy of a segment or receive provider secrets.
- **Main process** owns filesystem writes, manifest durability, hashing, recovery, upload retries and cleanup. High-volume binary chunks use a dedicated `MessagePort`/transferable-buffer channel, not request-response oRPC calls.
- **Preload** exposes a narrow typed capture API. It does not expose arbitrary filesystem or Electron APIs.
- **Backend** owns authorization and workspace state. JSON control-plane calls use the typed Hono RPC client; audio uploads use signed direct `PUT`/multipart requests because binary uploads are outside RPC.
- **Worker** owns expensive and retryable media/AI processing. Web requests never wait synchronously for final transcription or intelligence generation.
- **LiveKit Agent** remains the AI-interview executor and is not part of the Meeting Buddy media path.

## Domain model

Keep the Meeting Buddy schema separate from AI and human interview runtime tables.

### `meeting_session`

One workspace meeting and its top-level lifecycle.

Suggested fields:

```text
id
organizationId
ownerId
title
visibility             private | workspace
status                 capturing | uploading | processing | ready |
                       upload_failed | processing_failed | trashed | purged
templateKey            general | recruiting_interview
startedAt
stoppedAt
savedAt
readyAt
trashedAt
purgeAfter
durationMs
activeTranscriptRevisionId
activeIntelligenceRevisionId
createdAt
updatedAt
```

Rules:

- A `capturing` row is a hidden control-plane lease, not a saved shared meeting.
- `(organizationId, ownerId)` may have at most one non-terminal active capture.
- `ready` requires a verified recording manifest and a final transcript. Intelligence failure does not erase the recording or transcript.
- `trashed` is excluded from ordinary queries but recoverable for seven days.
- `purged` has no playable object keys or derived content.

### `meeting_access`

Selected-member grants; workspace visibility remains a field on `meeting_session`.

```text
meetingId
userId
role                    editor | viewer
grantedBy
createdAt
```

The owner is derived from `meeting_session.ownerId`, not duplicated. Administrators bypass meeting ACL checks through the existing workspace role policy.

### `meeting_recruiting_context`

Optional one-to-one link to the existing candidate recruiting record.

```text
meetingId               primary key
interviewRecordId       unique only if product later requires it; not required for MVP
linkedBy
linkedAt
```

The meeting-side primary key enforces zero or one recruiting link. Changing the link creates an audit event. Linking selects the recruiting template by default but never deletes existing General Meeting intelligence revisions.

### `meeting_recording_asset`

Stores persisted object metadata, never the audio bytes themselves.

```text
id
meetingId
kind                    microphone | system | mixed
status                  uploading | verifying | ready | failed | deleted
storageKey
contentType
sizeBytes
durationMs
sha256
segmentCount
manifestVersion
createdAt
verifiedAt
```

`microphone` and `system` are immutable facts. `mixed` is a replaceable playback/export derivative.

### Transcript revisions and turns

```text
meeting_transcript_revision
  id
  meetingId
  revision
  kind                  live | final | human
  basedOnRevisionId
  provider
  model
  language
  status
  createdBy
  createdAt

meeting_transcript_turn
  id
  revisionId
  sequence
  track                 local | remote
  speakerKey            local | remote-0 | remote-1 | ...
  speakerDisplayName
  startMs
  endMs
  text
  confidence
```

Rules:

- Live turns never become authoritative merely because they arrived first.
- Final processing creates a new revision from the complete recording.
- Human correction creates a new view/revision and preserves the machine revision.
- Speaker display-name changes do not pretend to be biometric identity verification.
- Meeting Intelligence references the exact transcript revision used.

### Notes, intelligence and questions

```text
meeting_note
  id, meetingId, authorId, occurredAtMs, body, createdAt, updatedAt

meeting_intelligence_revision
  id, meetingId, revision, transcriptRevisionId, templateKey,
  structuredPayload, markdown, provider, model, promptVersion,
  createdBy, createdAt

meeting_question_thread
  id, meetingId, userId, createdAt, updatedAt

meeting_question_message
  id, threadId, role, content, transcriptCitations, createdAt
```

Meeting answers may use only the current meeting's authorized transcript, notes and intelligence. They must return transcript time ranges for factual claims.

### Processing runs and audit

Persist stage attempts separately from business artifacts:

```text
meeting_processing_run
  id, meetingId, stage, status, attempt, idempotencyKey,
  provider, model, errorCode, errorMessage, startedAt, finishedAt
```

Use the existing audit-log pattern for sharing, administrator access, recruiting-link changes, transcript correction, regeneration, restore and purge.

## Recording pipeline

### 1. Permission and source setup

At app startup, register Electron's display-media request handler in the main process. On start:

1. Validate macOS microphone and system-audio permissions.
2. Request microphone and system loopback as separate `MediaStream`s.
3. Stop and discard any display video track immediately; Meeting Buddy is audio-only.
4. Detect a silent/dead system track during the first seconds and show a blocking repair message.
5. Create a capture lease through the backend and a local spool directory under Meeting Buddy's own app-data directory.

Primary support target is macOS 14.2+; macOS 13 remains a compatibility target that requires explicit device testing. Do not claim support from build success alone.

### 2. Local segment format

Use two independent recording pipelines, one per track. Start with browser-supported Opus/WebM segments unless the provider spike proves a different container is necessary.

Each immutable 15–30 second segment records:

```text
sessionId
track
sequence
captureStartedMonotonicMs
durationMs
contentType
sizeBytes
sha256
localPath
uploadStatus
```

Main-process writes must be atomic: write a temporary file, flush/close it, rename to the final segment name, then update the manifest. VAD may reduce realtime STT traffic but may never remove data from the recording path.

### 3. Live draft

An `AudioWorklet` produces provider-compatible PCM frames independently from the recording segments. Provider authorization follows this order:

1. Prefer provider-issued, meeting-scoped, short-lived client authorization and send audio directly from the desktop to the provider.
2. If a selected provider cannot safely authorize a desktop client, use a separately deployed STT gateway; do not add hour-long WebSocket media proxying to the Hono web process.
3. Never embed a workspace or vendor API key in Electron resources, settings or renderer code.

Live provider disconnects show “实时字幕已中断，录音仍在继续”. Reconnect starts a new live segment and never rewrites already finalized recording chunks.

### 4. End and save

`结束并保存` performs:

1. Stop both MediaRecorders and flush the final segments.
2. Freeze the local manifest and calculate a manifest hash.
3. Ask the backend which content-addressed segments are missing.
4. Obtain short-lived signed upload URLs scoped to the current workspace, meeting, track and segment.
5. Upload directly to Recording R2 with bounded concurrency and resumable retries.
6. Submit the immutable manifest and manifest hash.
7. Backend verifies object metadata and enqueues final processing idempotently.

Closing the app, losing connectivity or restarting the computer leaves the meeting in `upload_failed`/waiting-upload state and resumes from the manifest. Repeated Save, upload acknowledgement or worker delivery must not create duplicate objects, provider jobs or intelligence revisions.

### 5. Local cleanup

Only start the 24-hour cleanup timer after the server has verified all required recording assets. Cleanup removes files and manifest records from the local spool, not the server meeting. A separate explicit “清理本地副本” action may run earlier after verification.

## Final transcription and speaker handling

### Provider abstraction

Introduce a backend-owned port whose canonical result is provider-neutral:

```ts
interface MeetingTranscriptionProvider {
  createLiveAuthorization(input: LiveAuthorizationInput): Promise<LiveAuthorization>;
  transcribeFinal(input: FinalTranscriptionInput): Promise<CanonicalTranscript>;
  deleteRemoteArtifact?(input: DeleteRemoteArtifactInput): Promise<void>;
}
```

Do not expose Tongyi Tingwu, Deepgram or OpenAI response types outside the adapter directory. Persist provider/model/region on every revision and processing run.

### Initial provider evaluation

Before production default selection, run the same 20–50 representative recordings through:

- Tongyi Tingwu as the first mainland-China candidate;
- Deepgram Nova-3 as the international/live candidate;
- OpenAI diarized transcription as an offline comparison/fallback candidate.

Evaluate Chinese character error rate, English/technical entity recall, speaker error, timestamp drift, overlap loss, completion latency, retry behavior, deletion behavior and actual bill. Provider marketing benchmarks are not acceptance evidence.

### Two-track strategy

- The microphone track is `local`; the system track is `remote`.
- One-to-one meetings do not run global diarization merely to rediscover the physical track split.
- When the remote track contains multiple people, diarize only that track and use `remote-0`, `remote-1`, etc.
- Users rename anonymous speakers after the meeting; the LLM must not infer identities from conversational content.
- A media-finalization step creates a time-aligned mixed asset for playback/export while retaining both original tracks.

The worker image must have a pinned and verified media toolchain if FFmpeg is used for validation, concatenation, normalization or mixing. Do not shell out to an unversioned host binary.

## Meeting Intelligence

Reuse the existing Mastra/model-provider foundation, but add Meeting Buddy-owned agents and schemas rather than reusing interview-report prompts.

### General Meeting template

```text
summary
topics[]
decisions[]              statement + transcript citations
actionItems[]            task + owner if explicitly stated + due date if stated + citations
openQuestions[]
```

### Recruiting Interview template

```text
summary
candidateStatements[]    attributed statement + citations
keyExperience[]          evidence actually discussed + citations
verificationItems[]      incomplete or conflicting statements + citations
followUpActions[]
```

The recruiting template does not produce pass/fail, score, risk labels inferred from protected traits, or automatic pipeline changes. If a future feature needs hiring evaluation, it must enter the existing evidence-backed interview-report domain through a separate decision.

Generation is automatic after the final transcript becomes ready. Switching templates or correcting the transcript creates a new intelligence revision. Old revisions remain available for audit.

## Permissions and sharing

Centralize authorization in a Meeting Buddy access helper used by every route and worker query.

| Capability                               | Owner | Editor | Viewer | Workspace admin |
| ---------------------------------------- | ----: | -----: | -----: | --------------: |
| View/play/ask                            |   yes |    yes |    yes |             yes |
| Edit notes/speakers/corrected transcript |   yes |    yes |     no |             yes |
| Regenerate intelligence/export           |   yes |     no |     no |             yes |
| Share/change recruiting link             |   yes |     no |     no |             yes |
| Trash/restore/purge                      |   yes |     no |     no |             yes |

Selected shares live in `meeting_access`; whole-workspace sharing uses `meeting_session.visibility`. Every read must apply organization scope before meeting ACL. Presigned recording URLs are issued only after the same authorization check and expire quickly.

## Search

Use PostgreSQL first. The repo already enables `pg_trgm`; maintain a server-owned `searchText` projection from title, current transcript, notes and speaker display names, with an organization-scoped trigram GIN index. Search only meetings visible through the ACL helper.

Do not add Qdrant or cross-meeting embeddings for MVP. Ordinary search results return matching snippets and time ranges; single-meeting AI questions load only the selected meeting.

## API surface

Mount a route-owned module under the existing API tree, for example:

```text
/api/w/:slug/meeting-buddy
  POST   /sessions                         create hidden capture lease
  POST   /sessions/:id/discard             discard active local capture
  POST   /sessions/:id/upload-plan         return missing segments + signed URLs
  POST   /sessions/:id/save                freeze/verify manifest and enqueue processing
  GET    /sessions                         list/search visible meetings
  GET    /sessions/:id                     load meeting detail
  PATCH  /sessions/:id                     title/template/visibility
  PUT    /sessions/:id/access              replace selected-member grants
  PUT    /sessions/:id/recruiting-context  add/change optional recruiting link
  DELETE /sessions/:id/recruiting-context  remove link
  POST   /sessions/:id/transcript-corrections
  POST   /sessions/:id/intelligence        regenerate with selected template
  POST   /sessions/:id/questions           single-meeting question
  POST   /sessions/:id/trash
  POST   /sessions/:id/restore
  DELETE /sessions/:id                     admin/owner permanent purge
  GET    /sessions/:id/recording-url       short-lived playback URL
  GET    /sessions/:id/exports/:format     export control plane
```

Use Hono RPC plus `rpcFetch` for JSON endpoints with explicit status codes and Zod validation. Direct audio upload and binary exports remain plain fetch/object-store requests per the repository HTTP boundary.

## Queue and worker design

Create a Meeting Buddy-owned queue package rather than adding jobs to `resume-parse`.

Initial queue:

```text
meeting-processing
  finalize-recording
  final-transcription
  generate-intelligence
  rebuild-search-projection
  purge-meeting
```

Each job ID includes `meetingId + stage + inputRevision/hash`, making duplicate enqueue safe. The processor reads the database checkpoint before calling a provider. Provider calls and database publication are separate steps so a process crash cannot publish a partial transcript.

Start with `MEETING_TRANSCRIPTION_CONCURRENCY=20`. Media finalization and intelligence generation should have separate semaphores/config values even if they initially share one Worker process. Queue statistics should be added to the existing worker health/operations surface before production rollout.

## File ownership

Suggested implementation locations; adjust only when current code provides a more specific owner.

### Shared contracts and database

- Modify: `packages/db-schema/src/schema.ts`
- Modify: `packages/db-schema/src/relations.ts`
- Create: `packages/db-schema/src/meeting-buddy.ts`
- Create: `packages/shared/src/meeting-buddy.ts`
- Create: Drizzle migration under `apps/web/drizzle/`
- Modify: `packages/shared/src/permissions.ts`

### Desktop capture

- Modify: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/main/meeting-capture/`
- Create: `apps/desktop/src/preload/meeting-capture-api.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Extend: `apps/desktop/src/renderer/src/components/features/meeting/`
- Create: desktop meeting-library and meeting-detail routes under `src/renderer/src/routes/`

### Backend vertical slice

- Create: `apps/server/src/server/routes/meeting-buddy/route.ts`
- Create: `apps/server/src/server/routes/meeting-buddy/routes/sessions/`
- Co-locate schemas, DAOs, access helpers, transcription adapters and intelligence utilities inside the owning Meeting Buddy route tree.
- Extend: `apps/server/src/lib/server/s3.ts` with Meeting Buddy-specific direct-upload and object-key helpers.

Do not create a top-level backend `services/` directory and do not let the Worker import HTTP route handlers.

### Queue and Worker

- Create: `packages/meeting-processing-queue/`
- Modify: `apps/worker/src/index.ts`
- Create: `apps/worker/src/meeting-processing/`

Extract provider-neutral application functions so HTTP routes and Worker processors call the same use cases without importing each other's adapters.

### Recruiting integration

- Extend the existing desktop candidate selector to make the recruiting link optional.
- Add a saved-meeting linking action in Meeting Buddy detail.
- Add a Meeting Buddy artifact surface to the candidate recruiting record only after the general meeting domain is complete.

## Delivery sequence

### Phase 0 — risk spikes and evaluation corpus

1. Prove simultaneous microphone + system-audio capture on a signed Electron 39 macOS build.
2. Prove local segment durability, dead-track detection and crash recovery.
3. Prove direct signed multipart/segment upload to the configured Recording R2 CORS policy.
4. Capture a consented 20–50 meeting evaluation corpus covering the target apps, Chinese/English code-switching, Bluetooth devices, noise and overlap.
5. Benchmark providers and record the chosen workspace defaults without leaking provider response shapes into the domain.

Exit gate: no schema/UI implementation proceeds under an unverified assumption that Electron capture or the chosen provider supports the required audio path.

### Phase 1 — meeting domain and control plane

1. Add shared enums/contracts and Drizzle tables.
2. Add meeting ACL, administrator behavior and audit events.
3. Add capture lease, discard, meeting list/detail and state-transition tests.
4. Add signed upload-plan and manifest-verification APIs.
5. Add the Meeting Buddy queue with idempotency and recovery tests.

Exit gate: route/DAO tests prove organization isolation, roles, one active capture per user, zero-or-one recruiting link and repeated Save safety.

### Phase 2 — reliable local recording and save

1. Implement permission setup and dual source capture.
2. Implement atomic local segments and main-process manifest persistence.
3. Implement recording controls, levels, elapsed time and visible status.
4. Implement end-and-save, direct upload, resume after restart and 24-hour cleanup.
5. Implement mixed playback asset generation.

Exit gate: a 60-minute meeting survives network loss and app restart without losing already committed segments; a 4-hour soak stays within bounded memory and disk usage.

### Phase 3 — live and final transcription

1. Add provider policy and provider adapter contract.
2. Add short-lived live authorization/direct provider transport.
3. Render live draft separately from recording state.
4. Add final-transcription Worker processing and canonical revisions.
5. Add speaker rename and human correction.

Exit gate: live provider failure leaves the recording intact; final turns map to playable time ranges; a corrected transcript never overwrites the machine revision.

### Phase 4 — intelligence, search and questions

1. Implement both versioned templates and automatic generation.
2. Add manual regeneration from the current corrected/final transcript.
3. Build the trigram search projection and permission-filtered meeting library.
4. Add single-meeting question threads with transcript citations.
5. Add notes and timestamp navigation.

Exit gate: every generated decision/action/candidate statement either has a valid transcript citation or is rejected by schema validation.

### Phase 5 — sharing, exports, recruiting and deletion

1. Add Owner/Editor/Viewer sharing UI and workspace visibility.
2. Add recruiting link management and candidate-side display.
3. Add audio/Markdown/TXT/SRT/JSON export.
4. Add trash, restore, seven-day purge and local/server/provider deletion audit.
5. Add administrator operations and usage visibility.

Exit gate: unauthorized users cannot obtain metadata, transcript snippets, exports or signed recording URLs; purge removes every known object and derived artifact idempotently.

## Verification matrix

### Automated checks

- Shared/domain schema tests for statuses, manifests, revisions and canonical transcript normalization.
- Desktop unit tests for manifest recovery, segment ordering, hash verification, cleanup deadlines and duplicate Save.
- Backend route tests for workspace isolation and all Meeting Access Roles.
- DAO tests for one active capture, zero-or-one recruiting link, state compare-and-set and trash recovery.
- Queue tests for duplicate delivery, retry after provider success/database failure, and recovery after process restart.
- Export tests proving timestamps and speaker labels survive TXT/SRT/JSON generation.
- `pnpm --filter @app/desktop typecheck`
- backend/worker/package focused typechecks and Vitest suites
- root `pnpm check` with inherited failures explicitly separated from new failures
- `git diff --check`

### Real macOS checks

- Fresh permission grant, denial and revocation for microphone and system audio.
- Electron launched from signed app bundle, not only dev terminal.
- Fly/Zoom/Teams/Meet/Tencent Meeting/DingTalk audio while using speakers, wired headset, AirPods and Bluetooth microphone.
- System notification/music contamination and dead-track detection.
- Audio-device switch, sleep/wake, display change and app crash.
- Offline start, mid-meeting network loss, offline stop/save, restart and resumed upload.
- 60-minute ordinary run and 4-hour resource soak.
- Playback alignment between mixed audio and transcript time ranges.

### Provider evaluation gates

Record per provider/model/version:

- Chinese CER and English/technical entity recall;
- local/remote and remote-multi-speaker error rate;
- live p50/p95 lag and reconnect behavior;
- final completion p50/p95 for 30/60/240-minute inputs;
- cost per recorded hour including diarization and intelligence;
- provider-side retention, deletion and regional-processing evidence.

No provider becomes the production default until the same corpus is scored blindly and the data-region policy is verified under the actual account/contract.

### Capacity checks

- 100 concurrent capture leases and live authorization refreshes.
- 100 concurrent direct uploads without routing audio through Hono.
- 20 concurrent final-transcription jobs with queue backpressure and provider quota errors.
- Burst of 100 simultaneous meeting completions without duplicate processing or exhausted database pools.
- Worker restart while jobs are active and provider calls have partially completed.

## Rollout and observability

Roll out behind a workspace feature flag:

1. Internal macOS dogfood with recording-only diagnostics.
2. Small workspace cohort with one selected final provider.
3. Enable live draft after recording reliability meets the exit gate.
4. Enable sharing/recruiting link only after ACL audit tests pass.
5. Expand provider choices only after region, quota and deletion behavior are verified.

Required metrics/logs:

- capture start/stop reason, permission state and silent-track events;
- local segment gap count, spool bytes and recovery outcomes;
- upload bytes, retries, manifest verification and time-to-ready;
- live lag/reconnects without audio content in logs;
- provider/model/stage latency, quota failures and billed duration;
- queue waiting/active/failed counts;
- transcript revision and intelligence revision lineage;
- trash/purge completion across database, R2, provider and local recovery copy.

Never log raw audio, transcript bodies, signed URLs, provider credentials or candidate-sensitive meeting content.

## Final recommendation

Implement Meeting Buddy as a new vertical slice with three stable seams:

1. **Capture seam** — Electron produces verified local dual-track recording segments.
2. **Canonical transcript seam** — provider adapters produce versioned, provider-neutral turns.
3. **Meeting Intelligence seam** — Mastra reads an exact transcript revision and produces cited structured output.

This lets the product replace a capture adapter, transcription model or LLM without migrating the meaning of a saved meeting. Do not begin with Bot infrastructure, a provider-specific database shape, or reuse of the AI-interview conversation tables merely to shorten the first implementation.
