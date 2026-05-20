# 工作区共享邀请链接

> 设计稿 · 2026-05-21

## 背景

当前工作区邀请走 Better Auth `organization` 插件，模式是：admin/owner 在 `/w/[slug]/studio/members` 填一个邮箱、选一个角色，系统生成一次性 `invitation.id`，邀请链接形如 `/invite/[id]`，被邀人接受后落 `member`。这种模式适合定向邀请，但不适合"把链接丢群里、人来人到"的场景。

本设计新增一类**共享邀请链接**：可生成多个、可禁用、人人可走同一条链接加入。两套机制并存，互不影响。

## 需求总览

- 新增"邀请链接"：URL 形如 `https://<host>/join/<code>`，匿名访问会先去 OAuth 登录再回到 join 页确认加入；已登录访问直接看到确认页。
- 链接可由 owner/admin 生成 / 禁用，禁用后立即失效。
- 允许一个工作区同时存在多个有效链接，靠创建人 + 时间区分（不要 label）。
- 多次使用，永不自动过期，仅手动禁用。
- 通过链接加入的成员角色统一默认 `hr`，事后由 admin 在成员页改。
- admin 能看到每条链接邀请进来的成员列表。
- 现有邮箱邀请保留不动。

非目标：

- 链接级 TTL / 最大使用次数 / 链接级角色配置（YAGNI）。
- 链接被禁用 / 删除后保留事件级 join 历史（用 `member.invite_link_id` 列表代替，离开即不计入）。
- 注册路径调整：项目目前 OAuth-only，登录页已经覆盖。

## 用户流程

```
匿名用户访问 /join/<code>
  └─ 服务端 preview → 链接无效则渲染失效页
  └─ 有效 → redirect 到 /login?returnTo=/join/<code>
       └─ OAuth 登录完成 → returnTo 回 /join/<code> → 走"已登录"分支

已登录用户访问 /join/<code>
  ├─ 链接无效 → 失效页
  ├─ 已是该工作区成员 → 静默 setActive + redirect 到 /?goto=chat
  └─ 非成员 → 渲染确认页（工作区名 + logo + "加入 / 取消"）
       └─ 点"加入" → POST /api/join/:code/accept
            └─ 服务端事务里插 member(role=hr, inviteLinkId=link.id) → setActive → /?goto=chat
       └─ 点"取消" → redirect 到 /
```

确认页 UI 沿用现有 `src/app/invite/[token]/page.tsx` 的结构（双按钮 + 工作区名说明），不需要新设计稿。

## 数据模型

新表 `workspace_invite_link`，在 `packages/db-schema/src/schema.ts` 定义：

| 列               | 类型                                    | 说明                       |
| ---------------- | --------------------------------------- | -------------------------- |
| `id`             | text PK                                 | nanoid                     |
| `code`           | text unique                             | 16 字符 base62，URL 段     |
| `organizationId` | text NOT NULL, FK→organization, cascade | 所属工作区                 |
| `createdBy`      | text FK→user, on delete set null        | 创建者                     |
| `createdAt`      | timestamp default now NOT NULL          |                            |
| `disabledAt`     | timestamp nullable                      | 非空即禁用，保留时间做审计 |
| `disabledBy`     | text FK→user, on delete set null        | 谁禁用的                   |

索引：

- unique on `code`（路由查找）
- `(organization_id, disabled_at)`（admin 列表）

`member` 表新增一列：

```ts
inviteLinkId: text("invite_link_id").references(
  () => workspaceInviteLink.id,
  { onDelete: "set null" },
),
```

- 通过共享链接加入的 member 写入该字段。
- 邮箱邀请加入 / 初始 owner 保持 NULL。
- 链接被禁用 / 未来若被删除：member.inviteLinkId 设 NULL，**不连带删 member**。
- 查询"这条链接邀请了谁" = `SELECT * FROM member WHERE invite_link_id = ?`。

刻意不建 `workspace_invite_link_join` 事件表：当前需求只要求看"现在通过这条链接来的活跃成员"，member 一列足矣；想做事件级审计应该用统一的 `workspace_audit_log`，超出本期。

迁移：`pnpm db:generate` 生成一份 SQL，含建表 + member 加列；`pnpm db:migrate` 部署。

## API 路由

### 工作区子树：邀请链接管理

挂在现有 workspace router 下：`src/server/routes/studio/routes/workspace/routes/invite-links/`

| Method | Path           | 中间件                                      | 行为                                                                                                                         |
| ------ | -------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`            | `requirePermission("invitation", "create")` | 列工作区所有链接（含禁用），返回 `joinedCount` 来自一次 `LEFT JOIN member` + `COUNT(member.invite_link_id) GROUP BY link.id` |
| POST   | `/`            | 同上                                        | 创建：生成 nanoid id + 16 字符 code，返回完整记录                                                                            |
| PATCH  | `/:id/disable` | 同上                                        | 幂等：`disabledAt = now()`、`disabledBy = userId`；已禁用则不改                                                              |
| GET    | `/:id/members` | 同上                                        | 列通过该链接加入的成员（姓名、邮箱、加入时间），按 `member.createdAt` 倒序                                                   |

权限点用 Better Auth 已有的 `"invitation"` 资源 + `"create"` 动作（hr 角色无此权限，admin/owner 有），保持权限模型一致。

### 顶层接受路由

独立挂载在 `src/server/routes/join/route.ts`，路径 `/api/join/...`，**不在 workspace 子树下**：调用方未必有 active workspace context。

| Method | Path             | 鉴权   | 行为                                                                                                                                                                                        |
| ------ | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/:code/preview` | 可匿名 | 返回 `{ valid: boolean; workspace?: { name, slug, logo }; alreadyMember?: boolean }`。匿名调用 `alreadyMember` 永远 false。失效（不存在 / 已禁用）返回 `{ valid: false }`，不泄漏其它字段。 |
| POST   | `/:code/accept`  | 需登录 | 事务：(1) `SELECT FOR UPDATE` 链接，校验未禁用；(2) 检查 member 不存在；(3) 插入 `member(role='hr', inviteLinkId=link.id)`；返回 `{ organizationId }`。已是成员则幂等返回 200 + 该 org。    |

并发与一致性：

- accept 在同事务内重新读链接 disabledAt，避免 TOCTOU。
- `member_user_org_uq` 唯一索引兜底，捕获冲突即当幂等成功。
- code 生成用 `nanoid(16, base62 alphabet)`，碰撞概率忽略不计；插入捕到 unique 冲突重试一次即可。

### Schema 文件

`schema.ts` 仅放 `codeParamsSchema`（`{ code: z.string().length(16) }`）和 `disableParamsSchema`（`{ id }`）。POST 创建无 body。

## 前端

### 接受页

`src/app/join/[code]/page.tsx`（Server Component）

- 服务端用 Better Auth 服务端工具读 session，再调 DAO 而不是 HTTP fetch preview——同进程直接查更简单、也能拿到 session 用户判 `alreadyMember`。
- 失效 → 渲染 `<InvalidJoinLink />`（标题 + "返回首页"）。
- 未登录 + 有效 → 服务端 `redirect("/login?returnTo=" + encodeURIComponent("/join/" + code))`。
- 已登录 + 有效 + `alreadyMember` → 服务端 `redirect("/?goto=chat")`，并在 redirect 前调用 Better Auth `setActiveOrganization` 把活跃 org 切到该工作区（参考登录后的活跃 org 处理）。
- 已登录 + 有效 + 非成员 → 渲染 `<JoinClient code={code} workspace={...} />`（Client Component）。

`<JoinClient>`：

- 复用 `/invite/[token]/page.tsx` 的视觉风格（标题、说明、加入/取消按钮）。
- 点"加入" → `rpcFetch(rpc.api.join[":code"].accept.$post(...))` → `authClient.organization.setActive({ organizationId })` → `router.push("/?goto=chat")`。
- 点"取消" → `router.push("/")`。
- 后端 accept 仍保留对已存在 member 的幂等处理，作为竞态兜底（用户在打开页面后、点加入前从别处加入了同一工作区）。

`/api/join/:code/preview` 仍存在，供未来纯客户端场景使用，但 SSR 路径不走 HTTP，直接调 DAO。

### 成员管理页扩展

文件：`app/(auth)/w/[slug]/studio/members/_components/`

- 在工具栏现 `<InviteDialog>` 按钮旁加 `<InviteLinksDialog>`，触发器默认是 `<Button variant="outline">邀请链接</Button>`。两者各自独立 Dialog，不合并 Tabs：邮箱邀请定向单次、链接共享多次，语义差异大、混在一起降低可读性。
- 仅 admin/owner 可见，与现 `<InviteDialog>` 同 gating。

`<InviteLinksDialog>` 内部：

1. **顶部"生成新链接"按钮**：无表单字段。点击 → `POST /api/.../invite-links` → 把返回的链接复制到剪贴板（toast 提示）→ 在下方列表新增一行。
2. **链接列表**（表格）：列 = 完整 URL（`${origin}/join/${code}`，附复制按钮） / 创建人 / 创建时间 / 已加入人数（数字 + 可展开行）/ 状态（启用 / 已禁用）/ 操作（"禁用"按钮，已禁用则灰）。
3. **展开行**：点已加入人数 → 调 `/:id/members` → 表内嵌一个简易子表（姓名 + 加入时间）。

数据获取：`rpcFetch` + TanStack Query。新增成员或禁用链接后 `queryClient.invalidateQueries({ queryKey: ["invite-links", orgId] })`。

### 失效链接 UI

不独立 Route，由 `/join/[code]/page.tsx` server preview 失败时直接渲染 `<InvalidJoinLink />` 子组件（同文件夹下的 component）。

## 测试

集中放在 vitest 端：

- `workspace_invite_link` DAO：创建 / 列表 / 禁用 / 加入数聚合（用真实 DB，按 CLAUDE.md "feedback: 别 mock DB"）。
- `/api/join/:code/preview`：valid / disabled / not-found / 不泄漏字段。
- `/api/join/:code/accept`：成功插 member + 设 inviteLinkId；幂等已是成员；并发场景手工触发两次 accept 应有一次落 unique 冲突被吃掉。
- 权限：hr 调 invite-links GET/POST 应 403。

前端层不做 E2E，依赖手动验证（按 CLAUDE.md，UI 改动起本地 dev server 浏览器走一遍 golden path）。

## 验收清单

- [ ] admin 在成员页能生成一条链接，立即复制到剪贴板。
- [ ] 链接列表里能看到自己刚才生成的那条，加入人数=0。
- [ ] 匿名浏览器打开链接 → 进 OAuth 登录 → 回到 join 页确认 → 加入成功 → 跳到 chat。
- [ ] 已登录的另一个用户打开链接 → 直接看到确认页 → 加入。
- [ ] admin 回到链接列表，加入人数应 = 2，展开能看到这两个用户。
- [ ] admin 禁用该链接 → 再用匿名浏览器打开 → 看到失效页，不再触发登录跳转。
- [ ] 同一用户重复打开链接 → 静默跳到该工作区 chat，不重复加入。
- [ ] hr 角色用户调 GET `/api/.../invite-links` → 403。

## 风险与权衡

- **member 表与 link 系统耦合**：`member.inviteLinkId` 把链接信息塞进了核心表。收益是单查询出统计；代价是未来 link 系统重构时 member schema 牵连。可接受，因为这一列语义稳定（"成员经哪条链接进来"，与其它字段正交）。
- **链接永不过期**：被泄漏的链接需要 admin 主动禁用才失效。这是用户明确选择的策略，文档化即可。
- **OAuth-only 假设**：若未来引入邮箱密码注册，`/login?returnTo=` 仍能工作，但需要在登录页加注册入口；本期不做。
- **code 长度 16**：base62 ≈ 95 bit 熵，对付暴力枚举绰绰有余。如未来要短码（如 8 位）需重新评估。
