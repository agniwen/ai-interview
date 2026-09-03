# Meeting transcription provider benchmark

## Status

The harness is ready, but no production default is selected in this repository. A valid decision
requires one private run over the same 20–50 consented meetings and a completed actual-cost ledger.
The repository and GitHub Issue must contain neither the audio, reference transcript, signed source
URLs, credentials, task IDs, nor personal information. Generated evidence belongs under `.eval/`,
which is gitignored.

Provider marketing claims are not decision evidence. The only admissible recommendation is the
`report.decision` generated from a complete corpus run with all per-case costs supplied.
Tingwu remains in the three-provider ranking, but it is benchmark-only in the current production
registry. If it ranks first, the report emits `top-provider-not-production-eligible` and leaves the
production recommendation empty until a reviewed production adapter and deletion posture exist.

## Private inputs

Store all inputs outside the repository:

- dataset manifest: 20–50 cases, each with explicit `consent.confirmed=true` and
  `scope=provider-benchmark-v1`;
- one or two local audio assets per case (`microphone` and optionally `system`), with duration and
  SHA-256;
- canonical reference turns, English/technical entities, overlap intervals and non-identifying
  tags;
- Tingwu source-URL sidecar keyed by case and track, with one ordered HTTPS URL per 30-minute
  production chunk. URLs remain outside Git because they may be signed credentials. The CLI streams
  and hashes every remote chunk against the locally generated chunk before dispatch;
- actual cost ledger keyed as `{ provider: { caseId: costUsd } }`, filled from provider billing after
  the run rather than from list-price estimates.

The dataset parser rejects fewer than 20 or more than 50 cases, duplicate case IDs, missing consent,
duplicate tracks, traversal paths, more than 2 GiB of source audio per case and credential-like values.
Before any provider call the CLI streams every source to verify its declared byte size and SHA-256,
then uses the exact production FFmpeg settings to create 30-minute 16 kHz mono Opus chunks. The pinned
FFmpeg version and pipeline version are part of the corpus fingerprint and final evidence. Every
remote Tingwu chunk is stream-hashed against its local counterpart. Every adapter result is re-parsed
through `canonicalMeetingTranscriptSchema`; native provider payloads and transcript text are never
written to the final report.

## Run

Set credentials only in the process environment, then run:

```bash
pnpm --filter @app/server eval:meeting-transcription -- \
  --dataset /private/path/corpus.json \
  --tingwu-urls /private/path/tingwu-source-urls.json \
  --costs /private/path/actual-cost-usd.json \
  --out .eval/meeting-transcription/run-YYYYMMDD.json
```

Required credentials are `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`,
`ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`, and `TINGWU_APP_KEY`.
The output file is create-only, and an exclusive sibling lock prevents two processes from spending
against the same output path. Reruns must use a new path so prior evidence cannot be silently
overwritten. After every provider/case result, the CLI atomically updates a sibling `.partial`
checkpoint and skips those completed paid calls on restart. It also checkpoints a call immediately
before dispatch. If the process stops in that ambiguous window, restart refuses to make another paid
call until billing/task state is checked; private Tingwu task IDs remain only in that `.partial` file.
Pass `--retry-ambiguous` only when a new call is intentional, together with the reconciled
`--ambiguous-cost-usd` and `--ambiguous-deletion` result from the provider console. The reconciled
attempt remains in the mode-0600 `.private-evidence` sidecar after the public report is written, and
is included in retry/deletion/minimum-cost evidence without exposing remote task IDs. The final cost ledger entry
must be the total provider-console cost for the provider/case, including every ambiguous attempt; a value below
the reconciled-attempt subtotal is rejected. Tingwu task keys are stable for the same
corpus/case/chunk across restart. Timeouts and network ambiguity are not automatically retried; only a
quota rejection that occurred before a remote task was created gets bounded exponential retry.

Without `--costs`, the run is still useful for collecting provider billing, but the report includes
`actual-cost-missing`, sets `ready=false`, and refuses to recommend a provider.

Once invoices or provider usage exports are available, add actual costs without rerunning audio:

```bash
pnpm --filter @app/server eval:meeting-transcription:costs -- \
  --run .eval/meeting-transcription/run-YYYYMMDD.json \
  --costs /private/path/actual-cost-usd.json \
  --out .eval/meeting-transcription/run-YYYYMMDD-costed.json
```

The costed output is also create-only. A complete report requires exactly one run for every
provider/case pair, at least one successful provider, and an actual cost for every run.

Each `overlapIntervals` entry in the private corpus includes `startMs`, `endMs`, and at least two
`referenceTexts` containing only speech actually spoken inside that overlap interval. This prevents
long non-overlap turns from diluting the overlap-loss metric. Reference turns and overlap intervals
must remain within the corresponding source-audio duration.

## Scoring and decision

Each provider receives the same cases and canonical scoring inputs. Per-case evidence records:

- Chinese character error rate;
- exact normalized recall for annotated English and technical entities;
- speaker attribution error after best label mapping;
- mean timestamp drift;
- lost speech in annotated overlap intervals;
- wall-clock completion latency, retry count and terminal error class;
- remote deletion outcome (`deleted`, `delete-failed`, `unsupported`, or `not-applicable`);
- actual billed USD.

The versioned `quality-v1` ranking strongly weights failures and Chinese/speaker/overlap quality,
then includes entity recall, retry, normalized latency, normalized actual cost and deletion capability.
The JSON report preserves the numeric ranking and method name so an administrator's reason can cite
the corpus ID and decision evidence. Changing weights requires a new ranking version and a fresh run.

Fixtures cover success, rate limit, timeout, partial result, malformed response and deletion failure.
Speaker error uses an optimal one-to-one label assignment and penalizes missed, confused and extra
speakers. Timestamp drift aligns canonical turns by normalized content (including adjacent split
turns), while overlap loss compares reference/prediction content n-grams inside annotated overlap
intervals rather than trusting the number of returned speaker labels.

## Deployment and retention constraints

| Provider      | Evaluation route                                                                        | Region boundary                                                                                                                                               | Known retention/deletion evidence                                                                                                                                                                                                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tongyi Tingwu | Offline `CreateTask`, poll `GetTaskInfo`; result normalized from its transcription JSON | Public Tingwu API endpoint used here is `cn-beijing`; suitable for a mainland-China candidate, subject to the Workspace's Alibaba Cloud account and contract  | Public task API catalog exposes create/query but no meeting-scoped task delete operation, so the harness records `unsupported`. The service agreement says data is stored in the selected data center and deleted when the customer releases the service or deletes data; operational task-level deletion must be contractually confirmed before production selection. |
| Deepgram      | Pre-recorded `/v1/listen`, Nova-3, utterances and diarization; `mip_opt_out=true`       | Region is derived from the actual known US/EU/AU API endpoint; a custom endpoint is marked unverified and blocks a recommendation                             | Synchronous request creates no adapter-visible artifact, so deletion is `not-applicable`. Confirm the account's retention/MIP terms and selected regional endpoint before enabling it.                                                                                                                                                                                 |
| OpenAI        | `/v1/audio/transcriptions`, diarized JSON and production 30-minute chunks               | Default endpoint is international. A custom endpoint is marked unverified and blocks a recommendation; non-US residency requires separately verified controls | OpenAI documents no application-state or abuse-monitoring retention for `/v1/audio/transcriptions` and lists it as Zero Data Retention eligible. The synchronous adapter creates no deletable remote artifact.                                                                                                                                                         |

Primary references:

- [Tingwu CreateTask](https://help.aliyun.com/en/tingwu/api-tingwu-2023-09-30-createtask)
- [Tingwu GetTaskInfo and result polling](https://help.aliyun.com/en/tingwu/get-results)
- [Tingwu API catalog](https://help.aliyun.com/en/tingwu/api-tingwu-2023-09-30-overview)
- [Tingwu service agreement](https://help.aliyun.com/en/tingwu/terms-of-service)
- [Deepgram pre-recorded transcription](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded)
- [Deepgram diarization](https://developers.deepgram.com/docs/diarization/)
- [Deepgram regional/custom endpoints](https://developers.deepgram.com/reference/custom-endpoints)
- [OpenAI audio transcription API](https://platform.openai.com/docs/api-reference/audio/voice-consent-list?lang=curl)
- [OpenAI data controls and regional processing](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)

## Workspace policy

Workspace Administrators configure the allowed list, one default provider, an optional distinct
fallback provider, and a 10–500 character selection reason. The database stores all four fields with
the policy revision and audit actor. Policy changes invalidate active runs. An explicit retry uses the
fallback when configured; otherwise it retries the default. Only deployment-enabled provider adapters
appear in the settings UI. Tingwu remains benchmark-only until the production worker has an approved
private file-URL handoff and remote-deletion posture. The default and fallback apply only to Final
Meeting Transcript jobs. Live Transcript independently selects an allowed live-capable adapter;
currently that is OpenAI, so choosing Deepgram as the Final default does not disable live drafts when
OpenAI remains in the allowed list.
