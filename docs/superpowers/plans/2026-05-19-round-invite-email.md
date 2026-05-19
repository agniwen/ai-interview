# Round Invite Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "send email" action next to each interview round in the studio interviews list that sends a Resend-powered invitation email to the candidate, with per-round send-count + last-sent display and a confirm dialog for resends.

**Architecture:** New `studio_round_email_log` table in `@arc/db-schema`. New subrouter `studio/interviews/round-emails` exposing `POST /:roundId/send` and `GET /summary`. New `@/lib/server/resend.ts` lazy-init wrapper. React Email template lives in the subrouter's `utils/templates.tsx`. Frontend: prefetch summary alongside round list, add inline action that opens a confirm dialog.

**Tech Stack:** Hono + Drizzle + Next 16 App Router on the web side; `resend` SDK + `@react-email/components` for emails; Vitest with real-DB integration tests.

**Spec:** `docs/superpowers/specs/2026-05-19-round-invite-email-design.md`

**UI placement note:** the "round 详情页" the spec mentions is rendered today as the row-per-round list in `interview-management-page.tsx`. Each row IS a round. The send action goes into that row's `actionsColumn.inline`.

**Commit style:** conventional commits (`feat:`, `chore:`, `test:`, ...). Run `pnpm fix` before commits that touch TS.

---

### Task 1: Install dependencies + add env example

**Files:**

- Modify: `apps/ai-recruitment-copilot/package.json` (deps)
- Modify: `apps/ai-recruitment-copilot/.env.example`

- [ ] **Step 1: Add Resend deps**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot add resend @react-email/components @react-email/render
```

- [ ] **Step 2: Append env vars to `.env.example`**

Append to `apps/ai-recruitment-copilot/.env.example`:

```
# Resend (transactional email)
RESEND_API_KEY=
RESEND_FROM=noreply@yourdomain.com
```

- [ ] **Step 3: Verify typecheck still passes**

Run: `pnpm --filter @arc/ai-recruitment-copilot typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/ai-recruitment-copilot/package.json apps/ai-recruitment-copilot/.env.example pnpm-lock.yaml
git commit -m "chore(email): add resend + react-email deps and env example"
```

---

### Task 2: Resend server client wrapper

**Files:**

- Create: `apps/ai-recruitment-copilot/src/lib/server/resend.ts`
- Create: `apps/ai-recruitment-copilot/src/lib/server/__tests__/resend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/ai-recruitment-copilot/src/lib/server/__tests__/resend.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getResendClient, getResendFrom } from "@/lib/server/resend";

describe("resend client", () => {
  const ORIGINAL_KEY = process.env.RESEND_API_KEY;
  const ORIGINAL_FROM = process.env.RESEND_FROM;

  afterEach(() => {
    process.env.RESEND_API_KEY = ORIGINAL_KEY;
    process.env.RESEND_FROM = ORIGINAL_FROM;
  });

  it("throws when RESEND_API_KEY is missing", () => {
    process.env.RESEND_API_KEY = "";
    expect(() => getResendClient()).toThrow(/RESEND_API_KEY/);
  });

  it("throws when RESEND_FROM is missing", () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "";
    expect(() => getResendFrom()).toThrow(/RESEND_FROM/);
  });

  it("returns a Resend instance and the from address when env is set", () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "Acme <noreply@example.com>";
    const client = getResendClient();
    expect(client).toBeDefined();
    expect(getResendFrom()).toBe("Acme <noreply@example.com>");
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @arc/ai-recruitment-copilot test -- src/lib/server/__tests__/resend.test.ts`
Expected: FAIL (`Cannot find module '@/lib/server/resend'`).

- [ ] **Step 3: Implement the wrapper**

Create `apps/ai-recruitment-copilot/src/lib/server/resend.ts`:

```ts
import "server-only";
import { Resend } from "resend";

let cached: Resend | null = null;

export function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY 未配置");
  }
  if (!cached) {
    cached = new Resend(key);
  }
  return cached;
}

export function getResendFrom(): string {
  const from = process.env.RESEND_FROM;
  if (!from) {
    throw new Error("RESEND_FROM 未配置");
  }
  return from;
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm --filter @arc/ai-recruitment-copilot test -- src/lib/server/__tests__/resend.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
pnpm fix
git add apps/ai-recruitment-copilot/src/lib/server/resend.ts apps/ai-recruitment-copilot/src/lib/server/__tests__/resend.test.ts
git commit -m "feat(email): add lazy-init Resend server client"
```

---

### Task 3: Add `studio_round_email_log` table + relations

**Files:**

- Modify: `packages/db-schema/src/schema.ts` (append new table)
- Modify: `packages/db-schema/src/relations.ts` (append entries)

- [ ] **Step 1: Append the table to `packages/db-schema/src/schema.ts`**

At the end of the file (after the last table definition, before any export-only blocks), add:

```ts
export type StudioRoundEmailLogStatus = "sent" | "failed";

export const studioRoundEmailLog = pgTable(
  "studio_round_email_log",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resendMessageId: text("resend_message_id"),
    roundId: text("round_id")
      .notNull()
      .references(() => studioInterviewSchedule.id, { onDelete: "cascade" }),
    sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
    status: text("status").$type<StudioRoundEmailLogStatus>().notNull(),
    subject: text("subject").notNull(),
    templateKey: text("template_key").notNull().default("round_invite"),
    toEmail: text("to_email").notNull(),
  },
  (table) => [
    index("studio_round_email_log_organization_idx").on(table.organizationId),
    index("studio_round_email_log_round_created_idx").on(table.roundId, table.createdAt),
  ],
);
```

- [ ] **Step 2: Append relations to `packages/db-schema/src/relations.ts`**

Add inside the `defineRelations(schema, (r) => ({ ... }))` object, alongside the existing entries (alphabetical position is fine; do NOT remove anything):

```ts
  studioRoundEmailLog: {
    interviewRecord: r.one.studioInterview({
      from: r.studioRoundEmailLog.interviewRecordId,
      to: r.studioInterview.id,
    }),
    organization: r.one.organization({
      from: r.studioRoundEmailLog.organizationId,
      to: r.organization.id,
    }),
    round: r.one.studioInterviewSchedule({
      from: r.studioRoundEmailLog.roundId,
      to: r.studioInterviewSchedule.id,
    }),
    sentByUser: r.one.user({
      from: r.studioRoundEmailLog.sentBy,
      to: r.user.id,
    }),
  },
```

Also extend the existing reverse relations:

- In `studioInterview` block: add `roundEmailLogs: r.many.studioRoundEmailLog(),`
- In `studioInterviewSchedule` block: add `emailLogs: r.many.studioRoundEmailLog(),`
- In `organization` block (if it lists reverse aggregations): add `studioRoundEmailLogs: r.many.studioRoundEmailLog(),` — only if the surrounding block follows that convention; otherwise skip.

- [ ] **Step 3: Typecheck the package**

Run: `pnpm --filter @arc/db-schema typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
pnpm fix
git add packages/db-schema/src/schema.ts packages/db-schema/src/relations.ts
git commit -m "feat(db): add studio_round_email_log table + relations"
```

---

### Task 4: Generate + apply migration

**Files:**

- Create: `apps/ai-recruitment-copilot/drizzle/<timestamp>_*.sql` (auto-generated)
- Modify: `apps/ai-recruitment-copilot/drizzle/meta/*` (auto-generated)

- [ ] **Step 1: Generate migration**

Run: `pnpm db:generate`
Expected: a new SQL file in `apps/ai-recruitment-copilot/drizzle/` creating `studio_round_email_log` with 4 FKs and 2 indexes.

- [ ] **Step 2: Review the generated SQL**

Open the new SQL file. Verify:

- `CREATE TABLE "studio_round_email_log" ...`
- 4 FK constraints (`organization_id` cascade, `interview_record_id` cascade, `round_id` cascade, `sent_by` set null)
- 2 indexes (`studio_round_email_log_organization_idx`, `studio_round_email_log_round_created_idx`)
- `template_key` default `'round_invite'`

If anything looks wrong, fix the schema (Task 3 step 1) and regenerate.

- [ ] **Step 3: Apply migration**

Run: `pnpm db:migrate`
Expected: migration succeeds, table exists.

- [ ] **Step 4: Commit**

```bash
git add apps/ai-recruitment-copilot/drizzle/
git commit -m "feat(db): migration for studio_round_email_log"
```

---

### Task 5: Shared API DTO types

**Files:**

- Create: `packages/db-schema/src/round-email-log.ts`

- [ ] **Step 1: Create the DTO module**

Create `packages/db-schema/src/round-email-log.ts`:

```ts
import { z } from "zod";

export const ROUND_EMAIL_LOG_STATUSES = ["sent", "failed"] as const;
export type RoundEmailLogStatus = (typeof ROUND_EMAIL_LOG_STATUSES)[number];

export interface RoundEmailSummary {
  count: number;
  lastSentAt: string | null;
  lastStatus: RoundEmailLogStatus | null;
}

export type RoundEmailSummaryMap = Record<string, RoundEmailSummary>;

export const sendRoundEmailParamsSchema = z.object({
  roundId: z.string().min(1, "缺少 roundId"),
});

export const summaryQuerySchema = z.object({
  roundIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(",")))
    .pipe(z.array(z.string().min(1)).min(1, "至少传一个 roundId").max(200)),
});

export interface SendRoundEmailResponse {
  logId: string;
  sentAt: string;
  toEmail: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arc/db-schema typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
pnpm fix
git add packages/db-schema/src/round-email-log.ts
git commit -m "feat(db-schema): add round email log DTO + zod schemas"
```

---

### Task 6: React Email template + render helper

**Files:**

- Create: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/utils/templates.tsx`
- Create: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/utils/__tests__/templates.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/utils/__tests__/templates.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderRoundInviteEmail } from "../templates";

describe("renderRoundInviteEmail", () => {
  it("renders subject from roundLabel", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "张三",
      interviewUrl: "https://example.com/interview/abc/r1",
      roundLabel: "技术终面",
      scheduledAt: new Date("2026-05-20T10:00:00.000Z"),
    });
    expect(result.subject).toBe("技术终面 面试邀请");
    expect(result.html).toContain("张三");
    expect(result.html).toContain("https://example.com/interview/abc/r1");
    expect(result.text).toContain("张三");
    expect(result.text).toContain("https://example.com/interview/abc/r1");
  });

  it("omits time block when scheduledAt is null", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "李四",
      interviewUrl: "https://example.com/x/y",
      roundLabel: "初筛",
      scheduledAt: null,
    });
    expect(result.subject).toBe("初筛 面试邀请");
    expect(result.text).not.toMatch(/排期|时间/);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @arc/ai-recruitment-copilot test -- src/server/routes/studio/routes/interviews/routes/round-emails/utils/__tests__/templates.test.tsx`
Expected: FAIL (`Cannot find module '../templates'`).

- [ ] **Step 3: Implement the template + render helper**

Create `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/utils/templates.tsx`:

```tsx
import "server-only";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";

interface RoundInviteEmailProps {
  candidateName: string;
  interviewUrl: string;
  roundLabel: string;
  scheduledAt: Date | null;
}

function formatScheduledAt(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function RoundInviteEmail({
  candidateName,
  interviewUrl,
  roundLabel,
  scheduledAt,
}: RoundInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{roundLabel} 面试邀请</Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px", maxWidth: "560px" }}>
          <Heading as="h2">面试邀请</Heading>
          <Text>你好 {candidateName}，</Text>
          <Text>诚邀你参加 “{roundLabel}” 环节。</Text>
          {scheduledAt ? <Text>预计时间：{formatScheduledAt(scheduledAt)}</Text> : null}
          <Section style={{ margin: "24px 0" }}>
            <Button
              href={interviewUrl}
              style={{
                backgroundColor: "#111827",
                borderRadius: "6px",
                color: "#ffffff",
                padding: "10px 20px",
                textDecoration: "none",
              }}
            >
              进入面试
            </Button>
          </Section>
          <Text style={{ color: "#6b7280", fontSize: "12px" }}>
            如果按钮无法点击，请复制以下链接到浏览器：{interviewUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderRoundInviteEmail(
  props: RoundInviteEmailProps,
): Promise<{ html: string; subject: string; text: string }> {
  const node = <RoundInviteEmail {...props} />;
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
  return {
    html,
    subject: `${props.roundLabel} 面试邀请`,
    text,
  };
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm --filter @arc/ai-recruitment-copilot test -- src/server/routes/studio/routes/interviews/routes/round-emails/utils/__tests__/templates.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
pnpm fix
git add apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/
git commit -m "feat(email): React Email round-invite template + render helper"
```

---

### Task 7: DAO — insert log + summarize per round

**Files:**

- Create: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/dao.ts`
- Create: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/__tests__/dao.test.ts`

- [ ] **Step 1: Write the failing test (real DB)**

Create `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/__tests__/dao.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import {
  organization,
  studioInterview,
  studioInterviewSchedule,
  studioRoundEmailLog,
  user,
} from "@arc/db-schema/schema";
import {
  insertRoundEmailLog,
  summarizeRoundEmailLogs,
} from "@/server/routes/studio/routes/interviews/routes/round-emails/dao";

const ORG = "test_org_round_emails_dao";
const ORG_OTHER = "test_org_round_emails_dao_other";
const USER_ID = "test_user_round_emails_dao";
const INTERVIEW_ID = "test_int_round_emails";
const ROUND_A = "test_round_a";
const ROUND_B = "test_round_b";
const NOW = new Date("2026-05-19T12:00:00.000Z");

async function cleanup() {
  for (const orgId of [ORG, ORG_OTHER]) {
    await db.delete(studioRoundEmailLog).where(eq(studioRoundEmailLog.organizationId, orgId));
    await db
      .delete(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.organizationId, orgId));
    await db.delete(studioInterview).where(eq(studioInterview.organizationId, orgId));
    await db.delete(organization).where(eq(organization.id, orgId));
  }
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values({
    createdAt: NOW,
    email: "round-emails-dao@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "rd",
    updatedAt: NOW,
  });
  for (const orgId of [ORG, ORG_OTHER]) {
    await db.insert(organization).values({
      createdAt: NOW,
      id: orgId,
      name: `Org ${orgId}`,
      slug: orgId,
    });
  }
  await db.insert(studioInterview).values({
    candidateName: "Test",
    createdAt: NOW,
    id: INTERVIEW_ID,
    organizationId: ORG,
    updatedAt: NOW,
  });
  await db.insert(studioInterviewSchedule).values([
    {
      createdAt: NOW,
      id: ROUND_A,
      interviewRecordId: INTERVIEW_ID,
      organizationId: ORG,
      roundLabel: "Round A",
      sortOrder: 0,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ROUND_B,
      interviewRecordId: INTERVIEW_ID,
      organizationId: ORG,
      roundLabel: "Round B",
      sortOrder: 1,
      updatedAt: NOW,
    },
  ]);
});

afterAll(cleanup);

describe("round-emails dao", () => {
  it("insertRoundEmailLog persists a row", async () => {
    const log = await insertRoundEmailLog({
      errorMessage: null,
      interviewRecordId: INTERVIEW_ID,
      organizationId: ORG,
      resendMessageId: "msg_1",
      roundId: ROUND_A,
      sentBy: USER_ID,
      status: "sent",
      subject: "Round A 面试邀请",
      toEmail: "a@example.com",
    });
    expect(log.id).toBeTruthy();
    expect(log.status).toBe("sent");
  });

  it("summarizeRoundEmailLogs returns count + last sent timestamp + last status", async () => {
    await insertRoundEmailLog({
      errorMessage: "boom",
      interviewRecordId: INTERVIEW_ID,
      organizationId: ORG,
      resendMessageId: null,
      roundId: ROUND_A,
      sentBy: USER_ID,
      status: "failed",
      subject: "Round A 面试邀请",
      toEmail: "a@example.com",
    });
    const summary = await summarizeRoundEmailLogs(ORG, [ROUND_A, ROUND_B]);
    expect(summary[ROUND_A]?.count).toBe(2);
    expect(summary[ROUND_A]?.lastStatus).toBe("failed");
    expect(summary[ROUND_A]?.lastSentAt).toBeTruthy();
    expect(summary[ROUND_B]).toEqual({ count: 0, lastSentAt: null, lastStatus: null });
  });

  it("summarizeRoundEmailLogs ignores other organizations", async () => {
    const summary = await summarizeRoundEmailLogs(ORG_OTHER, [ROUND_A]);
    expect(summary[ROUND_A]).toEqual({ count: 0, lastSentAt: null, lastStatus: null });
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @arc/ai-recruitment-copilot test -- src/server/routes/studio/routes/interviews/routes/round-emails/__tests__/dao.test.ts`
Expected: FAIL (`Cannot find module '.../dao'`).

- [ ] **Step 3: Implement the DAO**

Create `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/dao.ts`:

```ts
import "server-only";
import { nanoid } from "nanoid";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { studioRoundEmailLog } from "@arc/db-schema/schema";
import type {
  RoundEmailLogStatus,
  RoundEmailSummary,
  RoundEmailSummaryMap,
} from "@arc/db-schema/round-email-log";

interface InsertRoundEmailLogInput {
  errorMessage: string | null;
  interviewRecordId: string;
  organizationId: string;
  resendMessageId: string | null;
  roundId: string;
  sentBy: string | null;
  status: RoundEmailLogStatus;
  subject: string;
  templateKey?: string;
  toEmail: string;
}

export interface RoundEmailLogRecord {
  createdAt: string;
  errorMessage: string | null;
  id: string;
  interviewRecordId: string;
  organizationId: string;
  resendMessageId: string | null;
  roundId: string;
  sentBy: string | null;
  status: RoundEmailLogStatus;
  subject: string;
  templateKey: string;
  toEmail: string;
}

export async function insertRoundEmailLog(
  input: InsertRoundEmailLogInput,
): Promise<RoundEmailLogRecord> {
  const id = nanoid();
  const [row] = await db
    .insert(studioRoundEmailLog)
    .values({
      errorMessage: input.errorMessage,
      id,
      interviewRecordId: input.interviewRecordId,
      organizationId: input.organizationId,
      resendMessageId: input.resendMessageId,
      roundId: input.roundId,
      sentBy: input.sentBy,
      status: input.status,
      subject: input.subject,
      templateKey: input.templateKey ?? "round_invite",
      toEmail: input.toEmail,
    })
    .returning();
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function summarizeRoundEmailLogs(
  organizationId: string,
  roundIds: string[],
): Promise<RoundEmailSummaryMap> {
  const result: RoundEmailSummaryMap = Object.fromEntries(
    roundIds.map((id) => [
      id,
      { count: 0, lastSentAt: null, lastStatus: null } as RoundEmailSummary,
    ]),
  );
  if (roundIds.length === 0) return result;

  const rows = await db
    .select({
      createdAt: studioRoundEmailLog.createdAt,
      roundId: studioRoundEmailLog.roundId,
      status: studioRoundEmailLog.status,
    })
    .from(studioRoundEmailLog)
    .where(
      and(
        eq(studioRoundEmailLog.organizationId, organizationId),
        inArray(studioRoundEmailLog.roundId, roundIds),
      ),
    )
    .orderBy(desc(studioRoundEmailLog.createdAt));

  for (const row of rows) {
    const summary = result[row.roundId];
    if (!summary) continue;
    summary.count += 1;
    if (summary.lastSentAt === null) {
      summary.lastSentAt = row.createdAt.toISOString();
      summary.lastStatus = row.status;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm --filter @arc/ai-recruitment-copilot test -- src/server/routes/studio/routes/interviews/routes/round-emails/__tests__/dao.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
pnpm fix
git add apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/dao.ts apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/__tests__/dao.test.ts
git commit -m "feat(email): round-emails DAO with insert + summary"
```

---

### Task 8: Subrouter — POST send + GET summary

**Files:**

- Create: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/route.ts`
- Create: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test (mock resend, real DB for assertions)**

Create `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/__tests__/route.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/server/db";
import {
  organization,
  studioInterview,
  studioInterviewSchedule,
  studioRoundEmailLog,
  user,
} from "@arc/db-schema/schema";
import { roundEmailsRouter } from "@/server/routes/studio/routes/interviews/routes/round-emails/route";

const ORG = "test_org_round_emails_route";
const USER_ID = "test_user_round_emails_route";
const INTERVIEW_NO_EMAIL = "test_int_no_email";
const INTERVIEW_WITH_EMAIL = "test_int_with_email";
const ROUND_NO_EMAIL = "test_round_no_email";
const ROUND_WITH_EMAIL = "test_round_with_email";
const NOW = new Date("2026-05-19T12:00:00.000Z");

vi.mock("@/lib/server/resend", () => {
  const send = vi.fn();
  return {
    getResendClient: () => ({ emails: { send } }),
    getResendFrom: () => "Acme <noreply@example.com>",
    __mockSend: send,
  } as unknown;
});

// helper: pull the mocked send fn back out
async function getMockSend() {
  const mod = (await import("@/lib/server/resend")) as unknown as {
    __mockSend: ReturnType<typeof vi.fn>;
  };
  return mod.__mockSend;
}

async function cleanup() {
  await db.delete(studioRoundEmailLog).where(eq(studioRoundEmailLog.organizationId, ORG));
  await db.delete(studioInterviewSchedule).where(eq(studioInterviewSchedule.organizationId, ORG));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_PUBLIC_URL = "https://app.example.com";
  await cleanup();
  await db.insert(user).values({
    createdAt: NOW,
    email: "route-test@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "rt",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG,
    name: "Org Route",
    slug: "test-route",
  });
  await db.insert(studioInterview).values([
    {
      candidateName: "无邮箱",
      createdAt: NOW,
      id: INTERVIEW_NO_EMAIL,
      organizationId: ORG,
      updatedAt: NOW,
    },
    {
      candidateEmail: "candidate@example.com",
      candidateName: "有邮箱",
      createdAt: NOW,
      id: INTERVIEW_WITH_EMAIL,
      organizationId: ORG,
      updatedAt: NOW,
    },
  ]);
  await db.insert(studioInterviewSchedule).values([
    {
      createdAt: NOW,
      id: ROUND_NO_EMAIL,
      interviewRecordId: INTERVIEW_NO_EMAIL,
      organizationId: ORG,
      roundLabel: "R-noemail",
      sortOrder: 0,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ROUND_WITH_EMAIL,
      interviewRecordId: INTERVIEW_WITH_EMAIL,
      organizationId: ORG,
      roundLabel: "R-withemail",
      sortOrder: 0,
      updatedAt: NOW,
    },
  ]);
});

afterAll(cleanup);

afterEach(async () => {
  const send = await getMockSend();
  send.mockReset();
});

// inject activeOrg via a wrapper to bypass workspace middleware
import { Hono } from "hono";
function buildClient() {
  const app = new Hono().use("*", async (c, next) => {
    c.set("activeOrg", { id: ORG } as never);
    c.set("user", { id: USER_ID } as never);
    await next();
  });
  app.route("/", roundEmailsRouter);
  return testClient(app);
}

describe("round-emails route", () => {
  it("POST /:roundId/send -> 400 when candidate email is missing", async () => {
    const send = await getMockSend();
    const client = buildClient();
    const res = await client[":roundId"].send.$post({ param: { roundId: ROUND_NO_EMAIL } });
    expect(res.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("POST /:roundId/send -> 200, writes a sent log", async () => {
    const send = await getMockSend();
    send.mockResolvedValueOnce({ data: { id: "msg_abc" }, error: null });
    const client = buildClient();
    const res = await client[":roundId"].send.$post({ param: { roundId: ROUND_WITH_EMAIL } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.toEmail).toBe("candidate@example.com");
    expect(send).toHaveBeenCalledOnce();
    const logs = await db
      .select()
      .from(studioRoundEmailLog)
      .where(eq(studioRoundEmailLog.roundId, ROUND_WITH_EMAIL));
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("sent");
    expect(logs[0].resendMessageId).toBe("msg_abc");
  });

  it("POST /:roundId/send -> 400 on Resend error, writes failed log", async () => {
    const send = await getMockSend();
    send.mockResolvedValueOnce({ data: null, error: { message: "rate limit" } });
    await db.delete(studioRoundEmailLog).where(eq(studioRoundEmailLog.roundId, ROUND_WITH_EMAIL));
    const client = buildClient();
    const res = await client[":roundId"].send.$post({ param: { roundId: ROUND_WITH_EMAIL } });
    expect(res.status).toBe(400);
    const logs = await db
      .select()
      .from(studioRoundEmailLog)
      .where(eq(studioRoundEmailLog.roundId, ROUND_WITH_EMAIL));
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("failed");
    expect(logs[0].errorMessage).toContain("rate limit");
  });

  it("GET /summary returns per-round aggregates", async () => {
    const client = buildClient();
    const res = await client.summary.$get({
      query: { roundIds: `${ROUND_WITH_EMAIL},${ROUND_NO_EMAIL}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[ROUND_WITH_EMAIL]?.count).toBeGreaterThanOrEqual(1);
    expect(body[ROUND_NO_EMAIL]).toEqual({ count: 0, lastSentAt: null, lastStatus: null });
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @arc/ai-recruitment-copilot test -- src/server/routes/studio/routes/interviews/routes/round-emails/__tests__/route.test.ts`
Expected: FAIL (cannot import `roundEmailsRouter`).

- [ ] **Step 3: Implement the subrouter**

Create `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/route.ts`:

```ts
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { studioInterview, studioInterviewSchedule } from "@arc/db-schema/schema";
import { summaryQuerySchema, type SendRoundEmailResponse } from "@arc/db-schema/round-email-log";
import { getResendClient, getResendFrom } from "@/lib/server/resend";
import { factory, jsonValidatorError } from "@/server/factory";
import { requirePermission } from "@/server/middlewares/permission";
import {
  insertRoundEmailLog,
  summarizeRoundEmailLogs,
} from "@/server/routes/studio/routes/interviews/routes/round-emails/dao";
import { renderRoundInviteEmail } from "@/server/routes/studio/routes/interviews/routes/round-emails/utils/templates";

const sendParamsSchema = z.object({ roundId: z.string().min(1) });

function getAppUrl(): string {
  const v = process.env.NEXT_PUBLIC_PUBLIC_URL;
  if (!v) throw new Error("NEXT_PUBLIC_PUBLIC_URL 未配置");
  return v.replace(/\/$/, "");
}

export const roundEmailsRouter = factory
  .createApp()
  .use("*", requirePermission("interview", "manage"))
  .post(
    "/:roundId/send",
    zValidator("param", sendParamsSchema, jsonValidatorError("参数错误")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg) return c.json({ error: "Unauthorized" }, 401);
      const { roundId } = c.req.valid("param");

      const [row] = await db
        .select({
          candidateEmail: studioInterview.candidateEmail,
          candidateName: studioInterview.candidateName,
          interviewRecordId: studioInterviewSchedule.interviewRecordId,
          roundLabel: studioInterviewSchedule.roundLabel,
          scheduledAt: studioInterviewSchedule.scheduledAt,
        })
        .from(studioInterviewSchedule)
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
        )
        .where(
          and(
            eq(studioInterviewSchedule.id, roundId),
            eq(studioInterviewSchedule.organizationId, activeOrg.id),
          ),
        )
        .limit(1);

      if (!row) return c.json({ error: "面试轮次不存在" }, 404);
      if (!row.candidateEmail) return c.json({ error: "候选人邮箱未填写" }, 400);

      const interviewUrl = `${getAppUrl()}/interview/${row.interviewRecordId}/${roundId}`;
      const { html, subject, text } = await renderRoundInviteEmail({
        candidateName: row.candidateName,
        interviewUrl,
        roundLabel: row.roundLabel,
        scheduledAt: row.scheduledAt,
      });

      const resend = getResendClient();
      const from = getResendFrom();
      const sendResult = await resend.emails.send({
        from,
        html,
        subject,
        text,
        to: row.candidateEmail,
      });

      if (sendResult.error || !sendResult.data) {
        const message = sendResult.error?.message ?? "Resend 未返回 message id";
        const log = await insertRoundEmailLog({
          errorMessage: message,
          interviewRecordId: row.interviewRecordId,
          organizationId: activeOrg.id,
          resendMessageId: null,
          roundId,
          sentBy: user?.id ?? null,
          status: "failed",
          subject,
          toEmail: row.candidateEmail,
        });
        return c.json({ error: `邮件发送失败：${message}`, logId: log.id }, 400);
      }

      const log = await insertRoundEmailLog({
        errorMessage: null,
        interviewRecordId: row.interviewRecordId,
        organizationId: activeOrg.id,
        resendMessageId: sendResult.data.id,
        roundId,
        sentBy: user?.id ?? null,
        status: "sent",
        subject,
        toEmail: row.candidateEmail,
      });

      const response: SendRoundEmailResponse = {
        logId: log.id,
        sentAt: log.createdAt,
        toEmail: row.candidateEmail,
      };
      return c.json(response, 200);
    },
  )
  .get(
    "/summary",
    zValidator("query", summaryQuerySchema, jsonValidatorError("缺少 roundIds")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) return c.json({ error: "Unauthorized" }, 401);
      const { roundIds } = c.req.valid("query");
      const summary = await summarizeRoundEmailLogs(activeOrg.id, roundIds);
      return c.json(summary, 200);
    },
  );

export type RoundEmailsRouter = typeof roundEmailsRouter;
```

- [ ] **Step 4: Adjust route test if your project uses a different permission key**

Check `apps/ai-recruitment-copilot/src/server/middlewares/permission.ts` for the actual permission strings. If `("interview", "manage")` doesn't exist, swap to the closest equivalent the codebase uses for interview write operations. The test client bypasses permission middleware via the wrapper app (it never calls `requirePermission`), so the test will still pass.

- [ ] **Step 5: Run route tests, expect pass**

Run: `pnpm --filter @arc/ai-recruitment-copilot test -- src/server/routes/studio/routes/interviews/routes/round-emails/__tests__/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
pnpm fix
git add apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/route.ts apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/__tests__/route.test.ts
git commit -m "feat(email): round-emails subrouter (POST send, GET summary)"
```

---

### Task 9: Mount the subrouter on `interviews/route.ts`

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/route.ts`

- [ ] **Step 1: Add the import**

Near the other route-local imports at the top of `apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/route.ts`, add:

```ts
import { roundEmailsRouter } from "@/server/routes/studio/routes/interviews/routes/round-emails/route";
```

- [ ] **Step 2: Mount before the final `;`**

Find the `studioInterviewsRouter` chain export. After the last `.get(...)` / `.post(...)` / `.delete(...)` in the chain, mount the child router:

```ts
  .route("/round-emails", roundEmailsRouter);
```

(If the export looks like `export const studioInterviewsRouter = factory.createApp()...;`, the mount goes inline within that chain, before the trailing `;`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @arc/ai-recruitment-copilot typecheck`
Expected: exit 0.

- [ ] **Step 4: Sanity-curl (optional, requires dev server + DB seed)**

If you have the dev server running and a valid round id in your DB:

```bash
curl -s "http://localhost:3000/api/studio/interviews/round-emails/summary?roundIds=<rid>" -H "cookie: <your auth cookie>" | jq
```

Expected: a JSON map keyed by round id.

- [ ] **Step 5: Commit**

```bash
pnpm fix
git add apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/route.ts
git commit -m "feat(email): mount round-emails subrouter under /studio/interviews"
```

---

### Task 10: Frontend — summary React Query hook + send mutation

**Files:**

- Create: `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviews/_components/round-email/use-round-email-summary.ts`
- Create: `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviews/_components/round-email/use-send-round-email.ts`

- [ ] **Step 1: Create the summary query hook**

Create `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviews/_components/round-email/use-round-email-summary.ts`:

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import type { RoundEmailSummaryMap } from "@arc/db-schema/round-email-log";

export function roundEmailSummaryQueryKey(roundIds: string[]) {
  return ["studio", "round-emails", "summary", [...roundIds].sort()] as const;
}

export function useRoundEmailSummary(roundIds: string[]) {
  return useQuery({
    enabled: roundIds.length > 0,
    queryFn: () =>
      rpcFetch<RoundEmailSummaryMap>(
        rpc.api.studio.interviews["round-emails"].summary.$get({
          query: { roundIds: roundIds.join(",") },
        }),
        "加载邮件发送状态失败",
      ),
    queryKey: roundEmailSummaryQueryKey(roundIds),
  });
}
```

- [ ] **Step 2: Create the send mutation hook**

Create `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviews/_components/round-email/use-send-round-email.ts`:

```ts
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import type { SendRoundEmailResponse } from "@arc/db-schema/round-email-log";

export function useSendRoundEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roundId: string) =>
      rpcFetch<SendRoundEmailResponse>(
        rpc.api.studio.interviews["round-emails"][":roundId"].send.$post({
          param: { roundId },
        }),
        "邮件发送失败",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio", "round-emails", "summary"] }),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @arc/ai-recruitment-copilot typecheck`
Expected: exit 0. If the RPC chain access (`rpc.api.studio.interviews["round-emails"]...`) doesn't typecheck, double-check Task 9 mounted the router and that `app.ts` mounts `studioInterviewsRouter` under the expected prefix.

- [ ] **Step 4: Commit**

```bash
pnpm fix
git add apps/ai-recruitment-copilot/src/app/\(auth\)/w/\[slug\]/studio/interviews/_components/round-email/
git commit -m "feat(email): round-email summary + send hooks"
```

---

### Task 11: Frontend — send button + confirm dialog in row actions

**Files:**

- Create: `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviews/_components/round-email/round-email-action.tsx`
- Modify: `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviews/_components/interview-management-page.tsx`

- [ ] **Step 1: Create the action component**

Create `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviews/_components/round-email/round-email-action.tsx`:

```tsx
"use client";
import { MailIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { RoundEmailSummary } from "@arc/db-schema/round-email-log";
import { useSendRoundEmail } from "./use-send-round-email";

interface RoundEmailActionProps {
  candidateEmail: string | null;
  roundId: string;
  summary: RoundEmailSummary | undefined;
}

export function RoundEmailAction({ candidateEmail, roundId, summary }: RoundEmailActionProps) {
  const [open, setOpen] = useState(false);
  const mutation = useSendRoundEmail();
  const count = summary?.count ?? 0;
  const lastSentAt = summary?.lastSentAt ?? null;
  const hasSent = count > 0;

  const disabled = !candidateEmail;
  const button = (
    <Button
      disabled={disabled || mutation.isPending}
      onClick={() => setOpen(true)}
      size="sm"
      variant="ghost"
    >
      <MailIcon className="size-4" />
      <span className="ml-1">{hasSent ? "重发" : "发送邮件"}</span>
      {hasSent ? (
        <span className="ml-1 text-muted-foreground text-xs">
          已发 {count} 次
          {lastSentAt
            ? ` · ${formatDistanceToNow(new Date(lastSentAt), { addSuffix: true, locale: zhCN })}`
            : ""}
        </span>
      ) : null}
    </Button>
  );

  const trigger = disabled ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{button}</span>
      </TooltipTrigger>
      <TooltipContent>请先在面试信息中填写候选人邮箱</TooltipContent>
    </Tooltip>
  ) : (
    button
  );

  return (
    <>
      {trigger}
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{hasSent ? "确认重发？" : "确认发送邮件？"}</AlertDialogTitle>
            <AlertDialogDescription>
              将发送邮件到 <strong>{candidateEmail}</strong>
              {hasSent && lastSentAt
                ? `。该轮次已发送过 ${count} 次，最近一次：${formatDistanceToNow(new Date(lastSentAt), { addSuffix: true, locale: zhCN })}。`
                : "。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await mutation.mutateAsync(roundId);
                  toast.success("邮件已发送");
                  setOpen(false);
                } catch (err) {
                  const message = err instanceof Error ? err.message : "邮件发送失败";
                  toast.error(message);
                }
              }}
            >
              {hasSent ? "重发" : "发送"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Wire the summary query + action into the round list**

Open `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviews/_components/interview-management-page.tsx`.

(a) Near the other imports, add:

```ts
import { RoundEmailAction } from "./round-email/round-email-action";
import { useRoundEmailSummary } from "./round-email/use-round-email-summary";
```

(b) Inside the component body, after the list query is resolved (where the list rows are available as e.g. `data?.records ?? []`), derive round ids and call the hook:

```ts
const roundIds = (data?.records ?? []).map((r) => r.id);
const summaryQuery = useRoundEmailSummary(roundIds);
const summaryMap = summaryQuery.data ?? {};
```

(c) Add a new column **before** the existing `actionsColumn(...)` entry in the columns array:

```ts
customColumn<StudioInterviewRoundListRecord>({
  cell: (r) => (
    <RoundEmailAction
      candidateEmail={r.candidateEmail}
      roundId={r.id}
      summary={summaryMap[r.id]}
    />
  ),
  key: "roundEmail",
  size: 200,
  title: "邮件",
}),
```

(Adjust the variable names if your local copy uses different identifiers — search for `customColumn<StudioInterviewRoundListRecord>` to find the surrounding pattern. Do NOT touch the existing `actionsColumn` entry; the new column is an additional one.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @arc/ai-recruitment-copilot typecheck`
Expected: exit 0.

- [ ] **Step 4: Smoke-test in the browser**

```bash
pnpm dev
```

Then in the studio interviews page:

1. Find a round whose candidate has no email → button should be disabled, hover shows tooltip.
2. Find a round with a candidate email → click → confirm dialog opens with the email shown → confirm → toast "邮件已发送" → button label flips to "重发" and shows "已发 1 次 · 刚刚".
3. Click "重发" → dialog text mentions previous send → confirm → count increments to 2.

If `RESEND_API_KEY` is unset, you'll get a 500 from the API — set it in `.env` to test end-to-end (or set it to a valid Resend test key).

- [ ] **Step 5: Commit**

```bash
pnpm fix
git add apps/ai-recruitment-copilot/src/app/\(auth\)/w/\[slug\]/studio/interviews/_components/
git commit -m "feat(email): round email send action + confirm dialog in round list"
```

---

### Task 12: Final verification

- [ ] **Step 1: Whole-app typecheck**

Run: `pnpm --filter @arc/ai-recruitment-copilot typecheck`
Expected: exit 0.

- [ ] **Step 2: Whole-app tests**

Run: `pnpm --filter @arc/ai-recruitment-copilot test`
Expected: all tests pass.

- [ ] **Step 3: Lint/format**

Run: `pnpm check`
Expected: clean. If not, `pnpm fix` and re-run.

- [ ] **Step 4: Update the spec status**

Edit `docs/superpowers/specs/2026-05-19-round-invite-email-design.md`:
change `**Status**: approved (brainstorm)` → `**Status**: implemented`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-19-round-invite-email-design.md
git commit -m "docs: mark round invite email spec as implemented"
```

---

## Notes for the implementing engineer

- **Real-DB tests**: `dao.test.ts` and `route.test.ts` hit the live DB pointed to by `DATABASE_URL`. The `beforeAll(cleanup)` / `afterAll(cleanup)` pattern is already used in this codebase — don't switch to mocks (per project memory, mocking the DB caused a prior migration-divergence incident).
- **Bilingual comments**: any comment you add to TS files must include both Chinese and English versions (project convention). The code blocks above don't add comments; if you need to add one during implementation, follow that rule.
- **No barrel files**: don't add an `index.ts` to the new `round-email/` UI folder — import each module by its explicit path.
- **`pnpm fix` before commit**: Ultracite (oxlint + oxfmt) reformats. The lefthook pre-commit hook auto-runs it on staged files; running it manually keeps diffs predictable.
- If the existing `requirePermission("interview", ...)` argument set doesn't include `"manage"`, mirror whatever the closest `interviews/route.ts` POST handler uses (e.g. `"write"` or `"update"`).
