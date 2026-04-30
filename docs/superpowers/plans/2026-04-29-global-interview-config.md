# 全局面试配置 实施计划 / Global Interview Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前硬编码的开场白、结束语、公司情况上下文做成 Studio 中可视化编辑的全局单例配置，由 web 后端读取后通过 LiveKit participant metadata 传递给 Python agent，agent 端注入到 system prompt / on_enter / end_call。

**Architecture:** 新建 `global_config` 单例表 + Hono admin 路由 `/api/studio/global-config` + Studio 页面 `/studio/global-config`；token 颁发时读取该配置并塞进 metadata；agent 解析新字段，空值 fallback 到默认硬编码文案，保证向后兼容。

**Tech Stack:** Drizzle ORM (PostgreSQL) / Hono / Next.js 16 App Router + React 19 / shadcn/ui / Vitest / LiveKit Agents (Python) / pytest

---

## 文件结构 / File Structure

**新建 / Create:**

- `src/server/queries/global-config.ts` — 单例 getter / upsert
- `src/server/routes/global-config/route.ts` — Hono router (GET / PUT)
- `src/server/routes/global-config/__tests__/route.test.ts` — router 测试
- `src/lib/global-config.ts` — 共享类型 + zod schema
- `src/app/(auth)/studio/global-config/page.tsx` — Server Component 入口
- `src/app/(auth)/studio/global-config/_components/global-config-form.tsx` — Client form
- `agent/tests/test_prompts.py` — 纯单元测试，不调 LLM
- `agent/tests/test_interview_agent_init.py` — 实例字段单测

**修改 / Modify:**

- `src/lib/db/schema.ts` — 追加 `globalConfig` 表
- `src/server/app.ts` — 注册路由 + admin 中间件挂载
- `src/server/routes/interview/route.ts` — token 颁发时读取配置塞进 metadata
- `src/app/(auth)/studio/_components/studio-sidebar-slots.tsx` — 侧边栏新增"系统配置"组
- `agent/src/prompts.py` — `build_instructions` 注入"## 公司情况"段
- `agent/src/interview_agent.py` — 接收 opening/closing 配置，fallback 默认值
- `agent/src/agent.py` — 兜底告别引用 closing 配置

---

## Task 1：创建 `global_config` 数据表 schema

**Files:**

- Modify: `src/lib/db/schema.ts`（在 `interviewer` 表定义之后追加）

- [ ] **Step 1：追加表定义**

在 `src/lib/db/schema.ts` 末尾（与其他 table 同级）新增：

```ts
// 全局配置（单例表，固定 id="singleton"）
// Global config (singleton table, id="singleton")
export const globalConfig = pgTable("global_config", {
  id: text("id").primaryKey().default("singleton"),
  openingInstructions: text("opening_instructions").notNull().default(""),
  closingInstructions: text("closing_instructions").notNull().default(""),
  companyContext: text("company_context").notNull().default(""),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
```

- [ ] **Step 2：同步到数据库**

```bash
npm run db:push
```

期望输出：列出新建的 `global_config` 表，无错误。

- [ ] **Step 3：提交**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(db): add global_config singleton table"
```

---

## Task 2：共享类型 + zod schema

**Files:**

- Create: `src/lib/global-config.ts`

- [ ] **Step 1：创建文件**

```ts
import { z } from "zod";

// 表单/接口共享 schema / Shared schema for form & API
// Three free-form text fields, all optional empty strings.
export const globalConfigSchema = z.object({
  openingInstructions: z.string().max(4000).default(""),
  closingInstructions: z.string().max(4000).default(""),
  companyContext: z.string().max(8000).default(""),
});

export type GlobalConfigInput = z.infer<typeof globalConfigSchema>;

export interface GlobalConfigRecord extends GlobalConfigInput {
  updatedAt: string;
  updatedBy: string | null;
}
```

- [ ] **Step 2：提交**

```bash
git add src/lib/global-config.ts
git commit -m "feat(global-config): add shared schema and types"
```

---

## Task 3：query 模块 — 单例读取与 upsert

**Files:**

- Create: `src/server/queries/global-config.ts`

- [ ] **Step 1：创建文件**

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { globalConfig } from "@/lib/db/schema";
import type { GlobalConfigInput, GlobalConfigRecord } from "@/lib/global-config";

const SINGLETON_ID = "singleton";

function serialize(row: typeof globalConfig.$inferSelect): GlobalConfigRecord {
  return {
    openingInstructions: row.openingInstructions,
    closingInstructions: row.closingInstructions,
    companyContext: row.companyContext,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

// 读取全局配置；不存在时返回默认空配置（不写库）
// Read singleton config; if missing, return empty defaults without writing.
export async function getGlobalConfig(): Promise<GlobalConfigRecord> {
  const row = await db.query.globalConfig.findFirst({
    where: eq(globalConfig.id, SINGLETON_ID),
  });
  if (!row) {
    return {
      openingInstructions: "",
      closingInstructions: "",
      companyContext: "",
      updatedAt: new Date(0).toISOString(),
      updatedBy: null,
    };
  }
  return serialize(row);
}

// 单例 upsert（按固定 id 冲突更新）
// Singleton upsert (conflict on fixed id).
export async function upsertGlobalConfig(
  input: GlobalConfigInput,
  userId: string | null,
): Promise<GlobalConfigRecord> {
  const now = new Date();
  const values = {
    id: SINGLETON_ID,
    openingInstructions: input.openingInstructions,
    closingInstructions: input.closingInstructions,
    companyContext: input.companyContext,
    updatedAt: now,
    updatedBy: userId,
  };
  const [row] = await db
    .insert(globalConfig)
    .values(values)
    .onConflictDoUpdate({
      target: globalConfig.id,
      set: {
        openingInstructions: values.openingInstructions,
        closingInstructions: values.closingInstructions,
        companyContext: values.companyContext,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
    })
    .returning();
  return serialize(row);
}
```

- [ ] **Step 2：提交**

```bash
git add src/server/queries/global-config.ts
git commit -m "feat(global-config): add singleton get/upsert queries"
```

---

## Task 4：Hono router — `/api/studio/global-config` GET + PUT

**Files:**

- Create: `src/server/routes/global-config/route.ts`

- [ ] **Step 1：创建 router**

```ts
import { factory } from "@/server/factory";
import { globalConfigSchema } from "@/lib/global-config";
import { getGlobalConfig, upsertGlobalConfig } from "@/server/queries/global-config";

export const globalConfigRouter = factory
  .createApp()
  .get("/", async (c) => {
    const record = await getGlobalConfig();
    return c.json(record);
  })
  .put("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = globalConfigSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "表单校验失败。" }, 400);
    }
    const record = await upsertGlobalConfig(parsed.data, c.var.user?.id ?? null);
    return c.json(record);
  });
```

- [ ] **Step 2：在 `src/server/app.ts` 注册路由**

在 import 区域追加：

```ts
import { globalConfigRouter } from "./routes/global-config/route";
```

在 admin middleware 挂载区域（与 `/api/studio/departments` 等同级）追加：

```ts
.use("/api/studio/global-config", authMiddleware, adminMiddleware)
.use("/api/studio/global-config/*", authMiddleware, adminMiddleware)
```

在 `.basePath("/api")` 之后的路由 mount 区域追加：

```ts
.route("/studio/global-config", globalConfigRouter)
```

- [ ] **Step 3：类型检查**

```bash
pnpm typecheck
```

期望：无新错误。

- [ ] **Step 4：提交**

```bash
git add src/server/routes/global-config/route.ts src/server/app.ts
git commit -m "feat(global-config): add GET/PUT admin route"
```

---

## Task 5：router 单元测试

**Files:**

- Create: `src/server/routes/global-config/__tests__/route.test.ts`

- [ ] **Step 1：写失败测试**

测试通过 mock `@/server/queries/global-config` 与 `factory`，验证 router 行为不依赖真实 DB。

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/queries/global-config", () => ({
  getGlobalConfig: vi.fn(async () => ({
    openingInstructions: "",
    closingInstructions: "",
    companyContext: "",
    updatedAt: "1970-01-01T00:00:00.000Z",
    updatedBy: null,
  })),
  upsertGlobalConfig: vi.fn(async (input, userId) => ({
    ...input,
    updatedAt: "2026-04-29T00:00:00.000Z",
    updatedBy: userId,
  })),
}));

import { globalConfigRouter } from "../route";

function makeRequest(method: "GET" | "PUT", body?: unknown) {
  return new Request("http://test/", {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("globalConfigRouter", () => {
  it("GET / returns the current config", async () => {
    const res = await globalConfigRouter.fetch(makeRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openingInstructions).toBe("");
    expect(json.closingInstructions).toBe("");
    expect(json.companyContext).toBe("");
  });

  it("PUT / persists trimmed values and echoes them back", async () => {
    const payload = {
      openingInstructions: "用候选人姓名打招呼",
      closingInstructions: "感谢候选人参加",
      companyContext: "公司介绍",
    };
    const res = await globalConfigRouter.fetch(makeRequest("PUT", payload));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openingInstructions).toBe(payload.openingInstructions);
    expect(json.closingInstructions).toBe(payload.closingInstructions);
    expect(json.companyContext).toBe(payload.companyContext);
  });

  it("PUT / rejects oversized payload", async () => {
    const huge = "x".repeat(5000);
    const res = await globalConfigRouter.fetch(
      makeRequest("PUT", {
        openingInstructions: huge,
        closingInstructions: "",
        companyContext: "",
      }),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2：跑测试确认失败/通过**

```bash
pnpm vitest run src/server/routes/global-config
```

期望：3 个用例全部 PASS（router + mock query 已在 Task 4 完成）。

- [ ] **Step 3：提交**

```bash
git add src/server/routes/global-config/__tests__/route.test.ts
git commit -m "test(global-config): add router unit tests"
```

---

## Task 6：侧边栏菜单项

**Files:**

- Modify: `src/app/(auth)/studio/_components/studio-sidebar-slots.tsx`

- [ ] **Step 1：导入图标**

将 `lucide-react` import 中追加 `SettingsIcon`：

```ts
import {
  BotIcon,
  Building2Icon,
  ClipboardListIcon,
  FileTextIcon,
  ListChecksIcon,
  SettingsIcon,
  UserCircleIcon,
} from "lucide-react";
```

- [ ] **Step 2：在 `navGroups` 末尾追加分组**

在 `navGroups` 的"题库"组之后追加：

```ts
{
  items: [
    {
      href: "/studio/global-config",
      icon: SettingsIcon,
      title: "全局配置",
    },
  ],
  label: "系统配置",
},
```

- [ ] **Step 3：lint**

```bash
pnpm lint
```

期望：无错误。

- [ ] **Step 4：提交**

```bash
git add src/app/\(auth\)/studio/_components/studio-sidebar-slots.tsx
git commit -m "feat(studio): add 系统配置 sidebar group"
```

---

## Task 7：Studio 页面 — Server Component 入口

**Files:**

- Create: `src/app/(auth)/studio/global-config/page.tsx`

- [ ] **Step 1：创建 page**

```tsx
import type { Metadata } from "next";
import { connection } from "next/server";
import { getGlobalConfig } from "@/server/queries/global-config";
import { GlobalConfigForm } from "./_components/global-config-form";

export const metadata: Metadata = {
  title: "全局配置",
};

export default async function StudioGlobalConfigPage() {
  await connection();
  const initial = await getGlobalConfig();
  return <GlobalConfigForm initial={initial} />;
}
```

- [ ] **Step 2：提交（page 暂未渲染，下一任务补 form 组件后整体可跑）**

```bash
git add src/app/\(auth\)/studio/global-config/page.tsx
git commit -m "feat(studio): add global-config page entry"
```

---

## Task 8：表单 Client Component

**Files:**

- Create: `src/app/(auth)/studio/global-config/_components/global-config-form.tsx`

- [ ] **Step 1：创建表单组件**

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { GlobalConfigRecord } from "@/lib/global-config";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  initial: GlobalConfigRecord;
}

export function GlobalConfigForm({ initial }: Props) {
  const [opening, setOpening] = useState(initial.openingInstructions);
  const [closing, setClosing] = useState(initial.closingInstructions);
  const [company, setCompany] = useState(initial.companyContext);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const res = await fetch("/api/studio/global-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          openingInstructions: opening,
          closingInstructions: closing,
          companyContext: company,
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({ error: "保存失败" }))) as {
          error?: string;
        };
        toast.error(error ?? "保存失败");
        return;
      }
      toast.success("已保存");
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">全局配置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          这些指令会注入到所有面试 agent。留空则使用系统默认文案。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="opening">开场白指令</Label>
        <Textarea
          id="opening"
          rows={4}
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          placeholder='例如：用候选人的名字"{候选人姓名}"打招呼，介绍你是 XX 公司"{岗位}"的面试官…'
        />
        <p className="text-xs text-muted-foreground">
          注入位置：面试开始时 agent 的 on_enter 指令。占位符 {"{候选人姓名}"} {"{岗位}"} 由 LLM
          自行替换。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="closing">结束语指令</Label>
        <Textarea
          id="closing"
          rows={3}
          value={closing}
          onChange={(e) => setClosing(e.target.value)}
          placeholder="例如：感谢候选人参加本次面试，祝你一切顺利。"
        />
        <p className="text-xs text-muted-foreground">
          注入位置：end_call 工具的 end_instructions 与超时兜底告别。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="company">公司情况</Label>
        <Textarea
          id="company"
          rows={8}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="公司业务、规模、文化等，候选人若问及可由此回答。"
        />
        <p className="text-xs text-muted-foreground">
          注入位置：system prompt 顶部的"## 公司情况"段。
        </p>
      </div>

      <div>
        <Button onClick={onSave} disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2：手动验证**

启动 `pnpm dev`，以管理员登录访问 `/studio/global-config`：

- 表单可显示初始空值
- 修改并点击保存 → toast "已保存"
- 刷新后值持久

如未配置 sonner toaster 全局 provider，保留 toast 调用即可（项目已使用 sonner，参考其他 studio 页面）。

- [ ] **Step 3：提交**

```bash
git add src/app/\(auth\)/studio/global-config/_components/global-config-form.tsx
git commit -m "feat(studio): add global-config form UI"
```

---

## Task 9：Web → Agent metadata 注入

**Files:**

- Modify: `src/server/routes/interview/route.ts`

- [ ] **Step 1：导入 query**

在 import 区域追加：

```ts
import { getGlobalConfig } from "@/server/queries/global-config";
```

- [ ] **Step 2：在 token 颁发前读取配置**

定位到当前 `participantMetadata` 构造处（约 188 行），在其前面插入：

```ts
const globalCfg = await getGlobalConfig();
```

并把三个字段加入 metadata JSON：

```ts
const participantMetadata = JSON.stringify({
  candidate_name: interviewRecord.candidateName,
  candidate_profile: interviewRecord.resumeProfile,
  global_closing_instructions: globalCfg.closingInstructions,
  global_company_context: globalCfg.companyContext,
  global_opening_instructions: globalCfg.openingInstructions,
  interview_questions: interviewRecord.interviewQuestions,
  interview_record_id: id,
  interviewers: interviewRecord.interviewers,
  job_description_preset_questions: interviewRecord.jobDescriptionPresetQuestions ?? [],
  job_description_prompt: interviewRecord.jobDescriptionPrompt ?? null,
  round_id: roundId,
  target_role: interviewRecord.targetRole,
});
```

- [ ] **Step 3：类型检查**

```bash
pnpm typecheck
```

期望：无新错误。

- [ ] **Step 4：提交**

```bash
git add src/server/routes/interview/route.ts
git commit -m "feat(interview): inject global config into participant metadata"
```

---

## Task 10：agent 端 — 公司情况注入到 system prompt

**Files:**

- Modify: `agent/src/prompts.py`

- [ ] **Step 1：写失败测试**

创建 `agent/tests/test_prompts.py`：

```python
from prompts import build_instructions


def _base_ctx(**overrides):
    ctx = {
        "candidate_name": "张三",
        "target_role": "后端工程师",
        "candidate_profile": {"skills": [], "workExperiences": []},
        "interview_questions": [],
        "job_description_preset_questions": [],
        "job_description_prompt": "",
        "global_company_context": "",
    }
    ctx.update(overrides)
    return ctx


def test_company_context_section_included_when_provided():
    ctx = _base_ctx(global_company_context="我们是一家做 AI 面试的公司，规模 50 人。")
    out = build_instructions(ctx)
    assert "## 公司情况" in out
    assert "AI 面试" in out


def test_company_context_section_omitted_when_empty():
    ctx = _base_ctx(global_company_context="")
    out = build_instructions(ctx)
    assert "## 公司情况" not in out


def test_company_context_section_omitted_when_missing_key():
    ctx = _base_ctx()
    ctx.pop("global_company_context")
    out = build_instructions(ctx)
    assert "## 公司情况" not in out
```

- [ ] **Step 2：跑测试确认失败**

```bash
cd agent && uv run pytest tests/test_prompts.py -v
```

期望：3 个测试 FAIL（"## 公司情况" 当前未输出）。

- [ ] **Step 3：修改 `prompts.py`**

在 `build_instructions` 内、`prefix_sections` 拼接区域（当前位于 `interviewer_prompt` / `job_description_prompt` 拼接附近，约 71-75 行），新增公司情况读取与注入：

```python
global_company_context = (
    interview_context.get("global_company_context") or ""
).strip()
```

将 `prefix_sections` 拼接改为按以下顺序：面试官角色设定 → 公司情况 → 岗位说明：

```python
prefix_sections = ""
if interviewer_prompt:
    prefix_sections += f"## 面试官角色设定\n{interviewer_prompt}\n\n"
if global_company_context:
    prefix_sections += f"## 公司情况\n{global_company_context}\n\n"
if job_description_prompt:
    prefix_sections += f"## 岗位说明\n{job_description_prompt}\n\n"
```

- [ ] **Step 4：跑测试确认通过**

```bash
cd agent && uv run pytest tests/test_prompts.py -v
```

期望：3 个测试 PASS。

- [ ] **Step 5：lint**

```bash
cd agent && uv run ruff format && uv run ruff check
```

- [ ] **Step 6：提交**

```bash
git add agent/src/prompts.py agent/tests/test_prompts.py
git commit -m "feat(agent): inject 公司情况 from global config into system prompt"
```

---

## Task 11：agent 端 — 开场白与结束语指令

**Files:**

- Modify: `agent/src/interview_agent.py`

- [ ] **Step 1：写失败测试**

创建 `agent/tests/test_interview_agent_init.py`：

```python
from interview_agent import (
    DEFAULT_CLOSING_INSTRUCTIONS,
    DEFAULT_OPENING_INSTRUCTIONS,
    InterviewAgent,
)


def _ctx(**overrides):
    ctx = {
        "candidate_name": "张三",
        "target_role": "后端工程师",
        "candidate_profile": {"skills": [], "workExperiences": []},
        "interview_questions": [],
        "job_description_preset_questions": [],
        "job_description_prompt": "",
        "global_company_context": "",
        "global_opening_instructions": "",
        "global_closing_instructions": "",
    }
    ctx.update(overrides)
    return ctx


def test_uses_custom_opening_when_provided():
    custom = "用最热情的语气欢迎候选人，介绍你是 ACME 的面试官。"
    a = InterviewAgent(_ctx(global_opening_instructions=custom))
    assert a._opening_instructions == custom


def test_falls_back_to_default_opening_when_empty():
    a = InterviewAgent(_ctx(global_opening_instructions=""))
    assert a._opening_instructions == DEFAULT_OPENING_INSTRUCTIONS


def test_uses_custom_closing_when_provided():
    custom = "感谢您的时间，再见。"
    a = InterviewAgent(_ctx(global_closing_instructions=custom))
    assert a._closing_instructions == custom


def test_falls_back_to_default_closing_when_empty():
    a = InterviewAgent(_ctx(global_closing_instructions=""))
    assert a._closing_instructions == DEFAULT_CLOSING_INSTRUCTIONS
```

- [ ] **Step 2：跑测试确认失败**

```bash
cd agent && uv run pytest tests/test_interview_agent_init.py -v
```

期望：4 个测试 FAIL（导入失败或属性不存在）。

- [ ] **Step 3：在 `interview_agent.py` 顶部新增默认常量**

紧邻 `INTERVIEW_TIME_LIMIT_SECONDS` 等常量之下：

```python
DEFAULT_OPENING_INSTRUCTIONS = (
    '用候选人的名字"{候选人姓名}"打招呼，简短介绍你是今天"{岗位}"岗位的面试官，'
    "告知面试即将开始，准备好了就确认开始。语气友好专业，一两句话即可。"
)
DEFAULT_CLOSING_INSTRUCTIONS = "感谢候选人参加本次面试，祝你一切顺利。"
```

- [ ] **Step 4：在 `__init__` 解析配置并 fallback**

将现有 `__init__` 改为：

```python
def __init__(
    self,
    interview_context: dict,
    interviewer: dict | None = None,
    time_limit_seconds: int = INTERVIEW_TIME_LIMIT_SECONDS,
) -> None:
    opening = (interview_context.get("global_opening_instructions") or "").strip()
    closing = (interview_context.get("global_closing_instructions") or "").strip()
    self._opening_instructions = opening or DEFAULT_OPENING_INSTRUCTIONS
    self._closing_instructions = closing or DEFAULT_CLOSING_INSTRUCTIONS

    end_call_tool = EndCallTool(
        extra_description="当面试结束、候选人要求结束、候选人连续三次答非所问、态度恶劣，或系统计时提示已到时间上限时，调用此工具结束面试。",
        delete_room=True,
        end_instructions=self._closing_instructions,
    )

    super().__init__(
        instructions=build_instructions(interview_context, interviewer),
        tools=end_call_tool.tools,  # type: ignore
    )

    self._candidate_name = interview_context.get("candidate_name", "候选人")
    self._target_role = interview_context.get("target_role", "未指定岗位")
    self._time_limit = time_limit_seconds
    self._started_at: float | None = None
```

- [ ] **Step 5：改写 `on_enter` 使用配置**

```python
async def on_enter(self):
    instructions = (
        f"{self._opening_instructions}\n\n"
        f"补充信息：候选人姓名是\"{self._candidate_name}\"，"
        f"岗位是\"{self._target_role}\"。"
    )
    await self.session.generate_reply(instructions=instructions)
```

- [ ] **Step 6：暴露 closing_instructions 属性供 agent.py 使用**

紧邻 `time_limit_seconds` / `hard_grace_seconds` property 处追加：

```python
@property
def closing_instructions(self) -> str:
    return self._closing_instructions
```

- [ ] **Step 7：跑测试确认通过**

```bash
cd agent && uv run pytest tests/test_interview_agent_init.py -v
```

期望：4 个测试 PASS。

- [ ] **Step 8：lint**

```bash
cd agent && uv run ruff format && uv run ruff check
```

- [ ] **Step 9：提交**

```bash
git add agent/src/interview_agent.py agent/tests/test_interview_agent_init.py
git commit -m "feat(agent): use global opening/closing instructions with fallback"
```

---

## Task 12：agent.py 兜底告别引用 closing 配置

**Files:**

- Modify: `agent/src/agent.py`

- [ ] **Step 1：定位并修改硬编码兜底文案**

定位到 `_enforce_time_limit` 内 `instructions=(...)` 处（当前约 236-239 行），改为引用 `interview_agent.closing_instructions`。该函数当前位于 `entrypoint`（或同等）作用域中，`interview_agent` 实例在外层已存在。

替换 instructions 字符串：

```python
handle = session.generate_reply(
    instructions=(
        "面试时间已到。请用一两句温暖的话感谢候选人参与并体面告别，"
        f"参考用语：{interview_agent.closing_instructions}。"
        "然后告知面试到此结束，不要继续提问。"
    ),
    allow_interruptions=False,
)
```

如果 `interview_agent` 不在 `_enforce_time_limit` 闭包作用域内，先确认它已经在外层作用域定义（`agent.py:196` 处）；闭包默认捕获即可使用。

- [ ] **Step 2：手动 console 验证（可选但推荐）**

```bash
cd agent && uv run src/agent.py console
```

简单走一轮面试，确认开场白与结束语调用未崩溃（无需触发超时）。

- [ ] **Step 3：lint**

```bash
cd agent && uv run ruff format && uv run ruff check
```

- [ ] **Step 4：提交**

```bash
git add agent/src/agent.py
git commit -m "feat(agent): use global closing instructions in timeout fallback"
```

---

## Task 13：端到端联调验证

**Files:** 无文件修改

- [ ] **Step 1：运行 web 完整校验**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

期望：全部通过。

- [ ] **Step 2：运行 agent 测试**

```bash
cd agent && uv run pytest tests/test_prompts.py tests/test_interview_agent_init.py -v
```

期望：全部通过。

- [ ] **Step 3：手动联调**

启动 `make dev`，以管理员身份：

1. 访问 `/studio/global-config`，填入示例：
   - 开场白："用候选人姓名打招呼，自我介绍你是 ACME AI 公司的面试官。"
   - 结束语："感谢您参加 ACME AI 面试，祝一切顺利。"
   - 公司情况："ACME AI 是一家做 AI 面试系统的初创公司，团队 50 人，总部在上海。"
2. 保存。
3. 打开一个候选人面试链接，开始面试。
4. 验证：
   - 开场白措辞反映了"ACME AI"自我介绍（LLM 会演绎）
   - 询问"你们公司是做什么的"，agent 能基于公司情况回答
   - 主动结束面试或触发 end_call，结束语提及"ACME AI"

- [ ] **Step 4：清空配置回归**

清空全局配置三个字段并保存，再开启一场面试，验证回退到旧默认行为（agent 仍正常打招呼/告别）。

- [ ] **Step 5：标记完成**

无需提交。如发现问题回到对应任务修补。

---

## 自检 / Self-Review

- ✅ Spec §2 数据决策 → Task 1
- ✅ Spec §3 后端 API → Task 4 + Task 5
- ✅ Spec §4 Web UI（侧边栏 + 页面 + 表单）→ Task 6 / 7 / 8
- ✅ Spec §5 metadata 传递 → Task 9
- ✅ Spec §6 agent 端三处改动 → Task 10（公司情况）+ Task 11（开场/结束）+ Task 12（兜底告别）
- ✅ Spec §7 错误处理（空值 fallback、admin 校验）→ Task 3 默认值 + Task 11 fallback
- ✅ Spec §8 测试 → Task 5 / 10 / 11
- ✅ Spec §9 部署顺序 → 提交粒度遵循"先 schema、再 web、再 agent"

无 TBD / 占位符。types 一致：`GlobalConfigInput` / `GlobalConfigRecord` 在 Task 2 定义，Task 3 / 4 / 7 / 8 复用同名字段；Python 端 `_opening_instructions` / `_closing_instructions` / `closing_instructions` property 在 Task 11 定义，Task 12 引用一致。
