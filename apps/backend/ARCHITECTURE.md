# Backend domain architecture

`apps/backend` is a standalone Nest application organized around domain ownership. A Nest module is a deep business boundary: it owns invariants, transactions, persistence writes, inbound transports, background work, and external adapters for one cohesive area. URL position and deployment entrypoint do not define a module.

## Deployable module graph

```text
AppModule
├─ infrastructure
│  ├─ BackendConfigModule
│  ├─ DatabaseModule
│  ├─ ObservabilityModule
│  ├─ RuntimeModule
│  └─ BackgroundModule
├─ IdentityAccessModule
├─ RecruitingSetupModule
├─ JobsModule
├─ CandidateLifecycleModule
├─ MeetingsDomainModule
├─ RecruitingCopilotDomainModule
└─ PlatformOperationsModule
```

`AppModule` is the only deployable composition root. The seven domain roots export nothing by default. A cross-domain interface is added only when a real caller exists and must contain stable value objects, snapshots, command results, and error unions—not Drizzle rows, HTTP requests, BullMQ jobs, storage keys, or concrete services. Domain `public.ts` barrels expose only those stable seams; Nest composition imports an explicit `*.module.ts` file instead of exporting framework modules through the domain API.

The intended synchronous dependency direction is:

```text
Identity Access ────────────────────────────────────────────────┐
Recruiting Setup ──→ Jobs ──→ Candidate Lifecycle ──→ Meetings │
                           └──────────────┬───────────────┘      │
                                          ↓                      │
                                Recruiting Copilot              │
                                          ↓                      │
                                Platform Operations ←────────────┘
```

Platform Operations is an inbound administration adapter. It owns no business tables and ultimately delegates changes to owner-provided admin commands.

## Why Candidate Lifecycle is one deep module

The product language says a Candidate Recruiting Record tracks one candidate for one Job Description and that AI interview rounds belong to that record. Creating or changing a recruiting record can atomically affect intake state, evaluation, recruitment stage, schedules, human rounds, offers, and notifications. Splitting those concepts into mutually dependent Nest modules would expose implementation details, multiply command/query seams, and encourage `forwardRef()`.

Candidate Lifecycle therefore contains owner-local vertical slices:

```text
candidate-lifecycle/
├─ intake/               # uploads, pool, and mail ingest
├─ resume-library/       # resume documents, profiles, and deduplication
├─ recruiting-records/   # stage, outcome, schedules, rounds, and notifications
├─ ai-interviews/        # candidate sessions, agent callbacks, and calendars
├─ human-interviews/     # LiveKit webhooks and human-meeting coordination
├─ notifications/        # owner-local notification preparation
├─ semantic-index/       # candidate semantic-index commands
└─ candidate-api/        # public candidate and resume HTTP adapters
```

These are vertical slices inside one transaction boundary, not public Nest modules. Meeting Buddy remains separate because `meetingSession` is an independent aggregate; it stores only an optional Recruiting Context Link.

## Data ownership

The executable source of truth is [`src/domains/data-ownership.ts`](./src/domains/data-ownership.ts). It assigns all 92 persisted tables to exactly one owner:

| Owner               | Owned data                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Identity Access     | Better Auth identity/session tables, workspace/member/role/group/invite tables                              |
| Recruiting Setup    | departments, interviewers, global defaults, candidate-form and question-template families                   |
| Jobs                | job descriptions and immutable versions, upgrade drafts/audits, assignments, referral links                 |
| Candidate Lifecycle | candidate/resume intake and pool, recruiting records, evaluations, interview runtime, offers, notifications |
| Meetings            | all Meeting Buddy session, media, transcript, intelligence, access, collaboration, search, and audit tables |
| Recruiting Copilot  | conversation/message/runtime state tables                                                                   |
| Platform Operations | none                                                                                                        |

PostgreSQL is local-substitutable infrastructure, so owner-local repositories may use Drizzle directly. It is not a cross-domain Interface. S3, LiveKit, Resend, Feishu, and AI providers are true external seams: domain workloads depend on stable ports, while production adapters are selected at the deployable composition boundary.

`studioInterview` is temporarily classified as Candidate Lifecycle's Candidate Recruiting Record persistence. It is not considered an interview aggregate. The target normalized schema separates candidate identity, resume document/profile, and candidate recruiting record using expand/backfill/switch/contract; external DTOs are composed in application queries so the HTTP contract does not need to change.

## Enforced write ownership

The ownership contract test parses both the authoritative Drizzle schema and production TypeScript. It recognizes `.insert(table)`, `.update(table)`, and `.delete(table)`, requires every schema table to have exactly one owner, and rejects every cross-owner write. `DECLARED_CROSS_OWNER_WRITES` is empty; it is not a standing exemption mechanism.

Cross-context changes use explicit owner commands. Current seams cover Candidate Setup Refresh, Candidate Copilot Actions, Candidate Document Writes, Candidate Evaluation Invalidation, Candidate/Meeting Recovery, narrow Mail Ingest, Candidate Document, and Candidate Notification administration, Identity Administration, Job Evaluation Snapshots, and Candidate Semantic Index cleanup. Adding a table without an owner or writing another owner's table fails the architecture tests.

When one synchronous use case must atomically change more than one owner, the coordinator opens `ApiDatabaseUnitOfWork` and calls each owner command inside it. Nested commands reuse the same transaction through request-local async context, so ownership stays explicit without splitting a previously atomic operation into independently committed transactions. The Job Evaluation Upgrade flow is the reference implementation and has a failure-path regression test.

## Background ownership

BullMQ connection and queue handles are infrastructure. Processor state machines, recovery, repositories, idempotency, and provider adapters live under `domains/candidate-lifecycle/workloads/` or `domains/meetings/workloads/`, according to the state they change. Candidate startup recovery and Meeting interval recovery are owner-local schedulers; the central recovery service only delegates their lifecycle and Meeting diagnostics snapshot. Queue payloads carry identifiers and versions; the central background layer only wires BullMQ transports, lifecycle, diagnostics, and domain workload composition. Workloads consume the `WorkloadObjectStorage` port; only the S3 adapter knows AWS SDK types and configuration.

## HTTP and HeyAPI boundary

Module names are internal. Refactoring must preserve HTTP method/path, status, Zod request and response schemas, Nest error envelope, OpenAPI tag, and explicit `operationId`. HeyAPI should use `operationId` as the stable generated symbol and expose frontend barrels/query-key factories that are finer-grained than backend transaction boundaries:

| Frontend domain       | Backend owner               |
| --------------------- | --------------------------- |
| `identity-access`     | Identity Access             |
| `recruiting-setup`    | Recruiting Setup            |
| `jobs`                | Jobs                        |
| `candidate-intake`    | Candidate Lifecycle         |
| `resume-library`      | Candidate Lifecycle         |
| `recruiting-records`  | Candidate Lifecycle         |
| `interviews`          | Candidate Lifecycle         |
| `meetings`            | Meetings                    |
| `recruiting-copilot`  | Recruiting Copilot          |
| `platform-operations` | Platform Operations adapter |

A page may compose several frontend domains. Generated code remains generated; application imports sit behind these stable barrels.

## Evolution order

1. Keep the ownership manifest and OpenAPI parity green.
2. Keep all HTTP implementation in owner-local vertical slices under `domains/`; the migration-era `features/` tree has been removed.
3. Keep `DECLARED_CROSS_OWNER_WRITES` empty; introduce an owner command or query whenever a cross-context use case appears.
   Platform administration delegates Candidate-owned mail-account, resume-cache, and notification changes through `CandidateAdministrationCommands`; its HTTP adapter only translates stable results into the existing Nest response or error envelope.
4. Narrow broad `WORKSPACE_DATABASE_PORT`, `HTTP_DATABASE`, shared object-storage, and generic queue-producer seams as ownership-specific repositories and commands are introduced.
5. Normalize `studioInterview` with an explicit data migration and dual-read verification before deleting legacy columns.

No step may introduce `forwardRef()`, a global service locator, or a second writer for a table.
