# Resume Identity Dedup (姓名 / 邮箱 / 电话)

**Date:** 2026-05-09
**Status:** Approved, ready for implementation
**Scope:** Studio create-interview dialog + chat one-click import button

## Background

Two prior dedup specs (`2026-05-08-resume-upload-dedup-design.md`, `-v2-design.md`) handle **file-content** dedup — same PDF, same hash. They prevent re-uploading an identical file but cannot detect "same candidate, different PDF" (re-uploads, updated resumes, screenshots vs. originals, etc.).

This spec adds **identity-based** dedup: after a resume is parsed into a structured profile, look up existing records by candidate name / email / phone and let the operator decide whether the upload is actually a duplicate.

The two mechanisms are complementary and live side by side.

## User stories

- As an operator creating a new interview record, after the LLM parses an uploaded resume, I want to see whether anyone else in the system has already entered an interview record for this person, so I don't accidentally create a duplicate.
- As an operator using the chat one-click import button, I want the same warning before the resume is persisted into the studio interview library.
- For each suspected match, I want to inspect its full detail (target role, status, recent reports) before deciding to continue or cancel.

## Out of scope

- Edit-interview dialog. The current edit flow does not re-parse the resume (only swaps the PDF), so there is no trigger point for identity dedup. The user explicitly confirmed.
- Fuzzy matching. We use exact match on trimmed/case-folded values. Soundex/Levenshtein etc. are deferred until we see the false-positive/negative ratio in production.
- Auto-merging duplicates. The operator always makes the call.

## Data model changes

### `resumeProfileSchema` (`src/lib/interview/types.ts`)

Add two nullable fields:

```ts
email: nullableStringSchema.describe(
  '候选人邮箱地址，简历中明确给出时填写；无法确认时返回 null'
),
phone: nullableStringSchema.describe(
  '候选人手机号或联系电话，简历中明确给出时填写；无法确认时返回 null'
),
```

The LLM extraction is schema-driven — adding these fields with descriptions is sufficient; no system-prompt tweaks needed. Existing prompt templates that iterate over schema keys will pick them up automatically.

### `studioInterview` table (`src/lib/db/schema.ts`)

Add one column:

```ts
candidatePhone: text('candidate_phone'),
```

Nullable. No unique constraint (we want soft warning, not hard rejection). No index initially — dedup is a low-frequency operation triggered only on parse.

Generate migration with `pnpm db:generate`, apply with `pnpm db:migrate` (per the team's Drizzle workflow — never use `db:push`).

### Studio interview record types

Update `StudioInterviewRecord` and the Zod schema in `src/lib/studio-interviews.ts` to expose `candidatePhone: string | null`. Update the row mapper.

## Backend endpoint

**`POST /api/studio/interviews/dedup-check`**

Request:

```ts
{ name?: string | null; email?: string | null; phone?: string | null }
```

Empty / null values are ignored. If all three are empty, returns `{ matches: [] }` without hitting the DB.

Response:

```ts
{
  matches: Array<{
    id: string;
    candidateName: string;
    candidateEmail: string | null;
    candidatePhone: string | null;
    targetRole: string | null;
    jobDescriptionName: string | null;
    status: StudioInterviewStatus;
    createdAt: string; // ISO
    matchedFields: Array<"name" | "email" | "phone">;
  }>;
}
```

Matching SQL (Drizzle):

```sql
WHERE (
  ($name IS NOT NULL AND lower(trim(candidate_name))  = lower(trim($name)))
  OR ($email IS NOT NULL AND lower(trim(candidate_email)) = lower(trim($email)))
  OR ($phone IS NOT NULL AND trim(candidate_phone) = trim($phone))
)
ORDER BY created_at DESC
LIMIT 20
```

`matchedFields` is computed in the route handler by re-checking each field against the input.

No status filter, no per-user filter — global across the whole studio.

Auth: requires the same studio session middleware as other studio interview endpoints.

## Frontend: shared overlay component

**New file:** `src/components/resume-dedup-overlay.tsx`

Props:

```ts
{
  open: boolean;          // controls visibility (parent uses it inside its own Modal)
  matches: DedupMatch[];
  onContinue: () => void; // proceed with parse / save
  onCancel: () => void;   // abort upload, clear state
}
```

Renders:

- Header text: `检测到 N 个可能重复的候选人记录`
- A list of cards, each showing: 候选人姓名、目标岗位、状态 badge、邮箱/电话（命中字段加粗高亮）、创建时间、`查看` button
- Bottom buttons: `继续解析` (primary) and `取消上传` (outline)

Clicking `查看` opens `<InterviewDetailDialog>` as a third-layer modal. The detail dialog already controls itself via `open / onOpenChange / recordId` props, so the overlay holds local state `[detailRecordId, detailOpen]` and renders the dialog at the end.

## Wiring point 1: create-interview-dialog

`src/app/(auth)/studio/interviews/_components/create-interview-dialog.tsx`

In `handleResumeChange`, between Step 1 (parse) and Step 2 (generate questions):

1. After the parse result is obtained and form fields are auto-filled:
   - Auto-fill `candidateEmail` from `resumeProfile.email` (if non-null)
   - Auto-fill `candidatePhone` from `resumeProfile.phone` (if non-null)
2. Call `fetchInterviewDedup({ name, email, phone })`.
3. If `matches.length > 0`:
   - Switch the existing `isBusy` overlay from "progress" mode to "dedup" mode (render `<ResumeDedupOverlay>`).
   - Pause the flow — do not start question generation.
   - On `继续解析` → close overlay, set busy=true, run Step 2.
   - On `取消上传` → call existing `handleCancelAnalysis()` (clears file, resets form).
4. If empty matches or endpoint error → silently proceed to Step 2 (warn via toast on error).

State model: introduce `dedupMatches: DedupMatch[] | null`. Non-null = overlay shown.

## Wiring point 2: resume-import-button (one-click import)

`src/components/resume-import-button.tsx`

In `runImport`, between Step 1 (parse, possibly cached) and Step 2 (generate questions):

1. After parse result is in hand, call `fetchInterviewDedup`.
2. If matches:
   - Switch the existing import progress modal body from `PhaseTracker` to `<ResumeDedupOverlay>`.
   - On `继续解析` → resume the flow, advance to `generating` phase.
   - On `取消上传` → call existing `handleCancel()`.
3. The save step (Step 3) needs to start including `candidatePhone` (read from `resumeProfile.phone ?? ""`) when posting to `/api/studio/interviews`.

## Form changes

`src/app/(auth)/studio/interviews/_components/interview-form/`:

- `index.ts` — add `candidatePhone: string` to form values, `createInterviewFormValues()`, `toInterviewFormValues()`. Validation: optional, no format check (Chinese mobile + landline + international vary too much).
- `basic-info-fields.tsx` — add a `<form.Field name="candidatePhone">` text input next to email, in the same `md:grid-cols-2` group. Label "候选人电话", placeholder "可选".
- `build-form-data.ts` — append `candidatePhone` to FormData.

Server side (`src/server/routes/interview/...`) — interview create + edit handlers already iterate over a schema; add `candidatePhone` to the request schema and persist it.

## API client

`src/lib/api.ts` — add:

```ts
export async function fetchInterviewDedup(input: {
  name: string | null;
  email: string | null;
  phone: string | null;
}): Promise<{ matches: DedupMatch[] }>;
```

Use the existing `apiFetch` helper.

## Edge cases

- All three identity fields are empty / null → skip dedup call entirely, proceed.
- `resumeProfile.name === '未发现信息'` → treat as null for dedup purposes (do not match against literal placeholder).
- Dedup endpoint failure → toast warning (`身份查重失败，已跳过`), continue the flow. Never block the upload.
- User cancels via Esc / outside-click on the wrapping create / import dialog while overlay is shown → propagate to `onCancel`, equivalent to "取消上传".
- Detail dialog query refetch: detail dialog already uses `refetchOnWindowFocus: true` after the previous task, so the third-layer view stays current.

## File touchpoints (estimated)

| File                                                                                | Change                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------- |
| `src/lib/interview/types.ts`                                                        | Add email + phone to resumeProfileSchema      |
| `src/lib/db/schema.ts`                                                              | Add candidate_phone column                    |
| `src/lib/db/migrations/<auto>`                                                      | Generated migration                           |
| `src/lib/studio-interviews.ts`                                                      | Type + Zod + mapper for candidatePhone        |
| `src/server/queries/studio-interviews.ts` (or equivalent)                           | Read/write phone                              |
| `src/server/routes/interview/<index/create/edit>.ts`                                | Accept phone in form data                     |
| `src/server/routes/interview/dedup-check.ts` (new)                                  | New endpoint                                  |
| `src/lib/api.ts`                                                                    | fetchInterviewDedup wrapper + DedupMatch type |
| `src/app/(auth)/studio/interviews/_components/interview-form/index.ts`              | Form values include phone                     |
| `src/app/(auth)/studio/interviews/_components/interview-form/basic-info-fields.tsx` | Phone input field                             |
| `src/app/(auth)/studio/interviews/_components/interview-form/build-form-data.ts`    | Append phone                                  |
| `src/app/(auth)/studio/interviews/_components/create-interview-dialog.tsx`          | Wire dedup flow                               |
| `src/components/resume-dedup-overlay.tsx` (new)                                     | Shared overlay component                      |
| `src/components/resume-import-button.tsx`                                           | Wire dedup flow + persist phone               |

## Verification

After implementation:

1. `pnpm typecheck` — must pass clean
2. `pnpm dlx ultracite check <changed files>` — zero warnings
3. Manual smoke (described in plan):
   - Create dialog: upload PDF with new candidate → no overlay, flow continues
   - Create dialog: upload PDF with existing candidate's name → overlay appears, "查看" opens detail, "继续解析" proceeds, "取消上传" clears state
   - One-click import: same two paths
   - Edit dialog: still has phone input, still saves; no dedup interception
