# 统一列表筛选验证（2026-08-26）

基线：`aee04c5cdc8e823f15d9c212a7398bbc3267a781`。范围见 [ADR 0032](../adr/0032-replace-list-filtering-in-one-coordinated-release.md)。

## 自动检查

- `bun run check`：通过。
- `bun run typecheck`：8 个 workspace 通过；后续 Web、Desktop 增量类型检查通过。
- Web 全量测试：681 项通过；筛选转换、未完成条件、Apply/Cancel、原子分页重置及清除勾选均有回归测试。
- Desktop 全量测试：162 项通过。首次多 workspace 并发运行有录音流测试超时，串行 workspace 复跑通过。
- Python：ruff check、ruff format --check、146 项 pytest 均通过。
- 后端：1564 项通过、24 项跳过、6 项失败；另一个权限测试套件缺少认证环境配置，补充本地测试占位配置后单独通过。

后端 6 项失败均位于本次未修改的代码：

1. `job-description-match-agent.test.ts`：仍期待旧“岗位要求”提示文本。
2. `lifecycle-write-boundary.test.ts`（2 项）：仍期待旧升级/草稿路径。
3. `job-description-code.test.ts`（2 项）：测试输入包含已从严格 schema 移除的旧配置字段。
4. `resumes/__tests__/route-behavior.test.ts`：重新评估事务 mock 未实现 `onConflictDoNothing`，响应变为 500。

`git diff aee04c5c -- apps/ai-recruitment-copilot-backend packages bun.lock` 为空；未扩展本轮范围修改这些失败。全量测试使用本机隔离 PostgreSQL（127.0.0.1:55439），未使用真实业务数据库执行测试写操作。

## 浏览器验收

- 招聘台：多选勾选时 URL 不变，取消不提交；点击应用才提交筛选并回第一页。
- 技能：100 项选项仅挂载约 16 项；搜索 TypeScript、方向键和回车选择、应用正常。实际滚动视口高度 256px，虚拟内容高度约 3208px。
- 人才库：选择“昨天”提交固定 `custom:2026-08-25:2026-08-25` 日期范围，保持分页边界稳定。
- 邮箱监听：保持“刷新 → 重置 → 立即轮询”顺序；日志起止日期有独立字段，日期边界与应用提交有交互回归测试。
- 表单题：默认显示“归档状态 是 未归档”；移除后 URL 为 `archivedFilter=all`，重置为 `archivedFilter=active`。
- 未修改主列表固定行高、日期吸顶和后台刷新实现。筛选栏改为搜索/动作与条件标签两行，骨架布局同步。

开发中类型检查的 i18n 编译与热更新曾触发 Vite SSR 初始化错误；干净启动开发进程后上述流程可正常验收。未把临时热更新状态当作功能通过证据。
