# Feishu Bot — HR Workflow Extension Design

**Date:** 2026-04-28
**Status:** Draft (pending implementation plan)
**Scope:** Extend the existing Feishu chat-sdk bot from "DM resume screening only" to a HR/interviewer workflow front-end covering three scenarios.

---

## 1. Goals & Non-Goals

### Goals

1. **Resume ↔ JD match (DM)** — HR activates a JD in the DM thread, then dropped resumes are scored against that JD. Falls back to the existing generic screening when no JD is active.
2. **Interview invitation (DM)** — HR triggers `/invite`, fills a card form (candidate, JD, interviewer, time), receives a copy-pasteable LiveKit interview link.
3. **Interview result push (group)** — when a candidate's voice interview ends, the report is auto-pushed as an interactive card to the recruiting group bound to that JD.
4. Establish a modular, testable structure inside `src/server/feishu/` so future workflows can be added without growing one large handler.

### Non-Goals (this iteration)

- Candidate-facing Feishu communication (candidates are external).
- Email/SMS dispatch of interview links — bot only generates the link, HR forwards it manually.
- Natural-language Studio queries ("how many resumes for JD-123?").
- Approval / status-flow workflows beyond the result-card buttons.
- Daily/weekly digest cards.
- Studio Web UI changes (group binding is done via `/bind` in the group itself, not via a Web form — Web binding can come later).

---

## 2. Architecture

### 2.1 Component overview

```
┌─────────────┐   webhook    ┌──────────────────────────────────────────┐
│   Feishu    │─────────────▶│  Next.js (web)                           │
│  (open API) │              │  /api/feishu/* (chat-sdk webhook)        │
│             │◀─────────────│                                          │
└─────────────┘   send/card  │  src/server/feishu/                      │
                             │   bot.ts                                 │
                             │   router.ts                              │
                             │     ├─ commands/   (/jd /invite /bind)   │
                             │     ├─ actions/    (card buttons)        │
                             │     ├─ flows/      (jd-match, invite,    │
                             │     │              resume-screening)     │
                             │     ├─ push/       (interview-report)    │
                             │     ├─ session/    (active-jd state)     │
                             │     ├─ identity/   (oauth binding gate)  │
                             │     └─ cards/      (card components)     │
                             │                                          │
                             │  /api/internal/interview-completed       │
                             │     ▲ HMAC-signed call from agent        │
                             │  src/server/agents/  (existing)          │
                             │  Postgres (Drizzle)                      │
                             └──────────────────────────────────────────┘
                                                   ▲ HTTP webhook
                             ┌─────────────────────┴────────────┐
                             │  Python LiveKit agent            │
                             │  on participant-disconnect:      │
                             │    1. flush report (existing)    │
                             │    2. POST interview-completed   │
                             └──────────────────────────────────┘
```

### 2.2 Boundaries

- **chat-sdk + `@repo/adapter-feishu` are not modified.** They continue to own webhook verification, message fetch, card render, and Feishu's PATCH limitation. We build only on top of them.
- **One new external HTTP route**: `POST /api/internal/interview-completed`, HMAC-signed, agent → web.
- **Studio Web UI**: untouched this iteration.
- **Python agent**: only one additional outbound HTTP call after the existing report flush.

### 2.3 Module dependency direction

Strict bottom-up; reverse imports are forbidden.

```
cards/, session/, identity/  ←  flows/, actions/, commands/, push/
flows/, push/                ←  router.ts, actions/
commands/, actions/          ←  router.ts
router.ts                    ←  bot.ts
```

`flows/*` may call `src/server/agents/*` (existing). `flows/*` may call DB. `cards/*` are pure render functions, no I/O.

### 2.4 File layout

```
src/server/feishu/
  bot.ts                           # Chat instance + handler registration (kept)
  router.ts                        # NEW: routeDM(thread, message) / routeGroup(...)
  commands/
    jd.ts                          # NEW: /jd, /jd clear
    invite.ts                      # NEW: /invite
    bind.ts                        # NEW: /bind JD-<id>
  actions/
    activate-jd.ts                 # NEW: card btn — set activeJdId
    create-invite.ts               # NEW: card form submit — create interview
    push-result.ts                 # NEW: card btn — pass / reject / next round
  flows/
    resume-screening.ts            # MOVED: existing handleResumeMessage logic
    jd-match.ts                    # NEW: uses job-description-match-agent
    invite-create.ts               # NEW: build interview row + LiveKit link
  push/
    interview-report.ts            # NEW: composeAndPush(interviewId)
  session/
    active-jd.ts                   # NEW: getActiveJd / setActiveJd / clearActiveJd
  identity/
    require-binding.ts             # NEW: gate; reply OAuth card if unbound
  cards/
    resume-report-card.tsx         # MOVED from card.tsx, kept compatible
    jd-match-report-card.tsx       # NEW: extends resume report with match score
    jd-list-card.tsx               # NEW
    invite-form-card.tsx           # NEW
    invite-link-card.tsx           # NEW
    interview-result-card.tsx      # NEW
    bind-success-card.tsx          # NEW
    oauth-binding-card.tsx         # NEW
```

Files to delete after migration: `src/server/feishu/handler.ts`, `src/server/feishu/card.tsx`, `src/server/feishu/extract-report.ts` (last one moves into `flows/resume-screening.ts` private helpers if only used there; otherwise `flows/_shared/extract-report.ts`).

A new top-level route file:

```
src/app/api/internal/interview-completed/route.ts   # NEW
```

---

## 3. Data Model Changes

Single Drizzle migration adds 1 column trio + 1 table. No destructive changes; safe for `db:push`.

### 3.1 `job_description` — add columns

```ts
feishuChatId:        text("feishu_chat_id"),                    // nullable
feishuChatBoundAt:   timestamp("feishu_chat_bound_at"),         // nullable
feishuChatBoundBy:   text("feishu_chat_bound_by")               // nullable
                       .references(() => user.id, { onDelete: "set null" }),
```

- One JD ↔ at most one Feishu group. Re-binding overwrites.
- Multiple JDs may share the same `feishuChatId`. No unique index.

### 3.2 `feishu_thread_state` — new table

```ts
threadId:        text("thread_id").primaryKey(),     // chat-sdk thread.id (= chat_id for DM)
activeJdId:      text("active_jd_id")
                   .references(() => jobDescription.id, { onDelete: "set null" }),
activeJdSetAt:   timestamp("active_jd_set_at"),
updatedAt:       timestamp("updated_at").defaultNow().notNull(),
```

Upsert by `threadId`. Future per-thread scratch state goes here as new columns; do not create another table.

### 3.3 Identity binding — no new table

Reuse Better Auth's `account` table. Lookup: `accountId = open_id` for `providerId IN ('feishu', 'feishu-jiguang')` → `userId`.

Verify (during implementation) that `(providerId, accountId)` has an index in the existing schema; if not, add one in the same migration.

### 3.4 No changes to: `interview`, `candidate`, `user`, chat-sdk's internal state tables.

---

## 4. Workflows

### 4.1 Workflow 1 — Resume ↔ JD match (DM)

**Activate JD**

1. HR DMs `/jd` (or `/jd list`).
2. `commands/jd.ts` queries JDs visible to HR (filter: `created_by = userId OR department in HR's departments` — start permissive, tighten later if needed). Paginate 10/page.
3. Bot posts `jd-list-card` with selectable rows; each row has an "选择" button carrying `{ type: "activate-jd", jdId }`.
4. HR clicks → `actions/activate-jd.ts`:
   - `requireBinding(openId) → userId` (gate)
   - `setActiveJd(threadId, jdId)`
   - reply card "已激活：JD-<id> <title>，现在投简历会按此 JD 匹配"
5. `/jd clear` → `clearActiveJd(threadId)` + reply "已清除激活 JD".

**Match a resume**

1. HR drops a PDF (with optional text) into the DM.
2. `router.routeDM` reads `getActiveJd(threadId)`.
3. If `activeJdId` present → `flows/jd-match.ts`:
   - Build UI message history (existing logic from `handler.ts`)
   - Load JD content from DB
   - Call existing `jobDescriptionMatchAgent` with `{ jdContent, resumeMessages }`
   - Stream to text (Feishu cannot edit text, so await `.text` then `thread.post`)
   - Extract structured fields via `extract-report` helper, post `jd-match-report-card`
4. If no active JD → `flows/resume-screening.ts` (the existing behaviour, unchanged).

**Edge cases**

- HR's user has no visible JDs → bot replies "你的部门下还没有 JD，请先在 Studio 创建一个"; `/jd` is a no-op until JDs exist.
- jd-match agent throws → log, fall back to `resume-screening` with a note "未能加载 JD，已按通用规则筛选".
- Active JD was deleted → on next message, `getActiveJd` returns null (FK `set null`), behaviour degrades to generic screening.

---

### 4.2 Workflow 2 — Interview invitation (DM)

**Trigger**

1. HR DMs `/invite`.
2. `commands/invite.ts`:
   - `requireBinding`
   - Loads HR's available JDs and interviewers (from Studio tables) for the form pickers
   - Posts `invite-form-card` (Feishu interactive form):
     - 候选人姓名 (text input, required)
     - 候选人备注 (text input, optional — used in the link landing page only, not stored on candidate side)
     - JD (single-select; default = active JD if any)
     - 面试官 (single-select)
     - 面试时间 (datetime picker)

**Submit**

3. Submit triggers `actions/create-invite.ts`:
   - Validate fields; if invalid, return inline error in the form card.
   - `flows/invite-create.ts`:
     - Create `interview` row reusing the existing creation logic in `src/server/routes/interview/*` (extract a callable function so both HTTP route and bot share it).
     - Generate LiveKit room/token using existing helpers (same code path as Studio uses today).
     - Build a deep link: `${APP_URL}/interview/<roomToken>`.
   - Reply `invite-link-card`:
     - Echoed candidate / JD / interviewer / time
     - The interview link in a copyable code block
     - A copy-paste message template (Chinese): `"您好，邀请您参加 <公司> <岗位> 岗位的 AI 面试，时间 <time>，链接：<link>"`
     - A "重新发起" button (re-opens the form pre-filled).

**Edge cases**

- LiveKit token generation fails → reply error card, no DB row created (wrap in transaction).
- HR has no interviewers configured → form picker disabled, reply with link to Studio.

---

### 4.3 Workflow 3 — Interview result push (group)

**Bind the group (one-time)**

1. In the recruiting group, HR types `@bot /bind JD-<id>`.
2. Group `onMessage` handler in `bot.ts` is re-enabled but only invokes `router.routeGroup`. Anything other than `/bind ...` is ignored (no chatter).
3. `commands/bind.ts`:
   - `requireBinding(openId)` — only OAuth-bound HRs can bind.
   - Resolve `chatId` from `thread.id` (= group chat_id).
   - Validate `JD-<id>` exists.
   - `UPDATE job_description SET feishu_chat_id = :chatId, feishu_chat_bound_at = now(), feishu_chat_bound_by = :userId WHERE id = :jdId`
   - If JD was previously bound to a different `chatId`, log audit + overwrite (no confirmation prompt — HR explicitly issued the command).
   - Reply `bind-success-card` in the group.

**Trigger from agent**

4. Python agent — extend the existing participant-disconnect handler (commit `c6c54bf`):
   - After the report is flushed to DB, `POST` to `${WEB_INTERNAL_URL}/api/internal/interview-completed` with body `{ interviewId }` and header `X-Signature: hmac-sha256(secret, body)`.
   - Use a shared secret env var: `INTERNAL_WEBHOOK_SECRET`. Same value on web side.

**Web handler**

5. `src/app/api/internal/interview-completed/route.ts`:
   - Verify HMAC. On mismatch → 401.
   - Look up `interview → jobDescription`; read `feishuChatId`.
   - Build `interview-result-card` (score, recommendation, top strengths, top risks, candidate name, interviewer, JD title, deep link "查看完整报告" → Studio interview page).
   - Card buttons: 通过 / 淘汰 / 进入下一轮. Each button carries `{ type: "push-result", interviewId, decision }`.
   - **Send target**:
     - If `feishuChatId` present → send to that group.
     - Else → DM the interview's creator (lookup `user → account` for openId). If no openId either → log & 200 (we did our best).
   - Always return 200 unless HMAC fails or interview not found (404).

**Decision buttons**

6. `actions/push-result.ts`:
   - `requireBinding(clicker openId)`
   - Update `interview.status` (or whatever existing field; check Studio's domain model — extract a shared status-update function rather than hand-rolling SQL).
   - Edit the original card to show "已 <通过/淘汰/下一轮> by <user>"; disable buttons.

**Edge cases**

- `feishuChatId` stale (group deleted, bot kicked) → Feishu API returns error; catch, fall back to DMing the creator, log alert.
- Multiple report writes for the same interview (idempotency) → web handler dedupes by `interviewId` within a 5-minute window using an in-memory LRU cache (acceptable: worst case is one duplicate card across instance restarts).
- Interview has no JD (rare, manual creations) → DM the creator only.

---

## 5. Identity Binding (soft OAuth gate)

Implementation in `src/server/feishu/identity/require-binding.ts`:

```ts
async function requireBinding(
  openId: string,
  providerHint?: string,
): Promise<{ userId: string } | { unbound: true }>;
```

- Checks `account` for `(providerId, accountId)` matches.
- On `unbound`, the caller posts `oauth-binding-card`: a single card with title "首次使用，请用飞书登录绑定身份" and a button linking to `${APP_URL}/login?return_to=feishu-success`.
- The `/login?return_to=feishu-success` page renders a small "已绑定，回飞书继续" message after successful OAuth — no further action needed; the next bot interaction will succeed.
- All commands and actions call `requireBinding` first, except the OAuth card itself.

The DM-default flow (drop a resume) is NOT gated — generic resume screening continues to work for anyone who DMs the bot, matching current behaviour. Only commands and actions that read/write Studio data are gated.

---

## 6. Card Inventory

All cards are functional components in `src/server/feishu/cards/`, returning chat-sdk JSX. Pure functions; testable via snapshot.

| Card                    | Purpose                                                                      | Buttons / actions                                               |
| ----------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `resume-report-card`    | Existing generic screening result                                            | none (display)                                                  |
| `jd-match-report-card`  | JD-specific match result (extends report card with `matchScore` + `jdTitle`) | none                                                            |
| `jd-list-card`          | Pickable JD list (10/page)                                                   | "选择" → `activate-jd`; "下一页" pagination                     |
| `invite-form-card`      | Form for /invite                                                             | submit → `create-invite`                                        |
| `invite-link-card`      | Result of invite create                                                      | "重新发起" → reopens form                                       |
| `interview-result-card` | Pushed to group on interview completion                                      | "查看完整报告" (link), "通过", "淘汰", "下一轮" → `push-result` |
| `bind-success-card`     | Confirms group bind                                                          | none                                                            |
| `oauth-binding-card`    | OAuth gate                                                                   | "去授权" (link)                                                 |

---

## 7. Error Handling & Boundary Cases

### 7.1 Cross-cutting

- Every handler wraps its work in `try/catch`; on error, posts a short user-visible error card and logs full stack with a request-tagged prefix (e.g., `[feishu:cmd:jd] ...`).
- Unknown command in DM → no-op (silent), preserving current "bare PDF → resume screening" UX.
- Unknown command in group → no-op.
- Unknown card action `type` → log warn, post "操作已过期，请重新发起".

### 7.2 Permissions

- Group `/bind` requires OAuth binding. Unbound senders get the OAuth card in DM (private), not in the group.
- Decision buttons (pass/reject) require OAuth binding. Anyone in the group could click; we accept that and just record `decidedBy = userId`.

### 7.3 Webhook security

- `POST /api/internal/interview-completed` — HMAC-SHA256 with shared secret. Body must include `interviewId`. Replay tolerated (idempotency dedup handles it).

### 7.4 Failure recovery

- Card send fails → log with chat_id; if it was a group push, fall back to DMing the interview creator.
- Agent webhook unreachable from web side → not applicable (web is the receiver).
- Agent → web webhook fails → agent logs and retries up to 3 times with exponential backoff (1s/3s/9s). Final failure: log only, do not crash agent.

---

## 8. Testing Strategy

### 8.1 Unit tests (vitest, alongside existing `cards.test.ts` style)

- `commands/*` parser tests: `/jd`, `/jd clear`, `/jd list`, `/invite`, `/bind JD-abc`, malformed inputs.
- `session/active-jd` tests: upsert, clear, foreign-key cascade behaviour (against test DB).
- `identity/require-binding` tests with seeded `account` rows.
- All `cards/*` tests: snapshot of JSX output for representative inputs (mirrors existing `cards.test.ts`).
- HMAC verify util tests.

### 8.2 Flow integration tests

- `flows/jd-match`: stub `jobDescriptionMatchAgent`, feed a mock thread + message + active JD, assert `thread.post` called with text + card.
- `flows/invite-create`: with test DB, assert interview row + LiveKit token args.
- `push/interview-report`: insert interview + JD with `feishuChatId`, call dispatcher, assert adapter `sendCard` called with right chat_id and card payload.

### 8.3 Webhook tests

- `/api/internal/interview-completed` route tests: valid HMAC → 200, invalid HMAC → 401, unknown interviewId → 404, missing JD chatId → falls back to DM (assert via spy).

### 8.4 Manual QA checklist (in plan doc)

- DM `/jd` → activate → drop PDF → expect JD-match card.
- DM with no `/jd` → drop PDF → expect generic resume report (regression check).
- DM `/invite` → submit → click link → land on interview page.
- Group `/bind JD-x` → run an actual interview to completion → result card appears in group → click 通过 → status updates in Studio.
- Unbind / kick bot from group → finish another interview → DM fallback fires.

---

## 9. Migration & Rollout

1. **Database migration** ships first (additive only; safe).
2. **Refactor existing** `handler.ts` / `card.tsx` into the new module structure with no behaviour change. Verify generic resume screening regression-free.
3. **Add features incrementally**: workflow 1 → workflow 2 → workflow 3 (each ships independently).
4. **Python agent webhook call** — added in workflow 3 task block; gated by env var (`INTERNAL_WEBHOOK_SECRET` unset → skip the call & log).
5. No feature flags — each workflow's entry is a new command or a new webhook, so partial rollout is naturally safe.

---

## 10. Open Questions / Deferred

- Studio Web UI for managing `feishuChatId` per JD — deferred to next iteration; group `/bind` is enough for now.
- Multi-JD ↔ multi-group mapping — deferred (current 1:N JD→1 group is sufficient).
- Approval workflows beyond pass/reject/next — deferred.
- Per-tenant Feishu app support (currently single-tenant via env vars) — deferred.

---

## 11. Tech Stack Touched

- Next.js 16 (App Router) — new internal route only
- Drizzle ORM — schema migration
- chat-sdk v4.26.0 + `@repo/adapter-feishu` (workspace pkg) — extended via handlers, not modified internally
- Better Auth — read-only lookup against `account` table
- LiveKit server SDK — reused for invite link generation
- Python LiveKit agent — one outbound HTTP call added
