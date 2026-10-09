# 人才库 / 招聘台关键词搜索维护

最后核对：2026-10-09。本文对应当前招聘表拆分后的代码；下方旧性能记录仅作为当时的验收证据。

## 当前数据与查询契约

- 搜索文档位于 `resume_pool_item` 和 `candidate_resume` 的 `search_text`、`search_cjk_bigrams`。招聘台通过 `recruiting_record`、`candidate`、`candidate_resume` 读取业务资料；旧 `studio_interview` 是历史档案。
- 列表采用 `textFilters` 原子字段：候选人、公司、学校、邮箱、电话、简历名、目标岗位。公司和学校先用索引搜索文档预筛，再从对应 profile 字段做精确校验，不能把一个字段的命中当成另一个字段的命中。
- 匹配为忽略英文大小写的字面包含；`%`、`_`、`!` 不作为用户通配符。SQL 搜索函数负责空白归一化，连续汉字双字组合用于 GIN 预筛。短英文、单字和高频词的性能需按真实数据验证。
- `resume_pool_item` 由已有数据库触发器维护搜索文档；`candidate_resume` 的正常业务写入由 `packages/database/src/recruiting-records.ts` 重建文档。不要假设新表沿用了旧 `studio_interview` 触发器。
- 搜索与列表始终保留工作区、人员可见范围和归档条件。归档不清空搜索文档；删除行后无需额外搜索清理任务。

实现入口：

- [字段搜索与索引预筛](../packages/resume-processing/src/internal/recruiting/resumes/dao/keyword-search.ts)
- [招聘资料写入与搜索文档重建](../packages/database/src/recruiting-records.ts)
- [维护脚本](../apps/server/src/scripts/resume-search-maintenance.ts)
- [招聘表切换约束](adr/0036-copy-recruiting-data-into-independent-tables.md)

## 维护命令

在仓库根目录运行，并显式指定目标 `DATABASE_URL`。脚本也会读取 Server 自己的环境文件；执行前确认目标数据库和备份。以下是维护示例，本次文档修正未执行数据库操作。

```bash
# 只读检查：NULL 待回填记录、有效 GIN 索引及操作符类
bun apps/server/src/scripts/resume-search-maintenance.ts check

# 默认只读查看待回填量
bun apps/server/src/scripts/resume-search-maintenance.ts backfill

# 分批回填 NULL 搜索字段，每批独立执行
bun apps/server/src/scripts/resume-search-maintenance.ts backfill --apply --batch-size=500

# 指定单表及续跑游标；--after-id 不能与 --table=all 同用
bun apps/server/src/scripts/resume-search-maintenance.ts backfill --apply --table=candidate_resume --after-id=LAST_ID

# 待回填量归零后，独立创建缺失索引并 ANALYZE
bun apps/server/src/scripts/resume-search-maintenance.ts indexes --apply
```

可选表只有 `resume_pool_item`、`candidate_resume`、`all`。旧文档中的 `maintain:resume-search` package script 已不存在，使用上面的文件入口。

回填只处理 `search_text` 或 `search_cjk_bigrams` 为 NULL 的现存行，不更改业务 `updated_at`，不调用解析或评价。人才库通过触发器重建；候选人简历直接根据当前候选人资料、简历、最近招聘记录的岗位字段计算。更改生成规则后若需重建非 NULL 文档，应另行制定回填方案，不能认为本命令会全量重建。

索引创建使用 `CREATE INDEX CONCURRENTLY`，不能放入事务；检查要求两种索引有效且字段、访问方法、操作符类匹配，不依赖旧索引名字。脚本不会自动删除无效或同名异构索引。

新环境先按完整迁移链建立 schema；已有环境按实际迁移状态检查，不能只重跑 2026-08-26 的旧表迁移。招聘模型切换后，回退旧应用不是安全的数据回滚方案，具体边界见 ADR 0036。

## 验证

PostgreSQL 集成测试显式使用专用地址，创建并清理独立 schema；未配置时跳过，不回退到业务 `DATABASE_URL`：

```bash
RESUME_SEARCH_TEST_DATABASE_URL=postgres://USER@127.0.0.1:PORT/TEST_DB \
  bun run --filter @app/server test \
  src/routes/studio/routes/resumes/dao/keyword-search.integration.test.ts
```

该测试含旧迁移 fixture 和当前维护函数验证，不构成真实部署性能或迁移完成的证明。真实验收需覆盖权限、总数、分页、编辑与删除后的搜索，以及不同数据量和冷热缓存下的执行计划。

## 历史性能记录（2026-08-26，旧表结构）

使用临时 PostgreSQL 18、UTF-8 / C locale，未访问业务数据库。
按实际表结构和已有索引复制临时表，比较未加字段与加字段/触发器/索引两个版本。
合成数据分布在 10 个组织，每条含一个公司和学校，创建时间每条相差一秒。
在 1 万、10 万条上执行 `EXPLAIN (ANALYZE, BUFFERS)`；每条查询运行 7 次，
舍弃第一次，以下是其余 6 次的中间样本值。没有强制索引扫描。

10 万条数据的代表性结果（毫秒；搜索为带组织过滤的 count）：

| 查询                              | 人才库：原方案 → 新方案 | 招聘台：原方案 → 新方案 |
| --------------------------------- | ----------------------- | ----------------------- |
| 原有邮箱关键词 candidate1000      | 10.386 → 2.075          | 2.137 → 2.141           |
| 公司“字节”（原方案临时遍历 JSON） | 8.589 → 0.046           | 9.275 → 0.403           |
| 学校“清华”（新功能）              | — → 0.493               | — → 0.381               |
| 普通列表，按组织过滤取最新 60 条  | 6.835 → 11.550          | 0.055 → 0.063           |

公司/学校命中 GIN 双字数组索引，原有英文关键词命中 trigram 索引。
上述普通列表只选择 id/name；人才库该场景没有创建人约束，使用现有索引过滤后排序。
它展示了主表加宽对扫描/排序的实际成本，不能声称主表加字段对所有列表查询“零影响”。
两个版本都在同机热缓存、低并发、合成数据上测试，不等于完整 API 延迟或生产 P95；
完整列表还包含资料、关联查询和网络传输，须在目标数据库按真实权限/筛选重测。

一次性插入 10 万条（包含索引维护）的耗时：人才库 570 → 6434ms，
招聘台 2225 → 9124ms。此测试的增量约每行 59–69 微秒，但长简历资料、
真实磁盘/WAL 与并发会改变结果。状态更新不重建搜索字段；资料更新仍承担生成与索引成本。
固定高度虚拟列表、滚动和刷新逻辑未修改，两个搜索辅助字段不随列表响应返回。

回归覆盖真实 SQL、公司/学校、全部原有搜索字段、Unicode 空白、通配符转义、
旧学校兼容、重解析替换、清空、删除、可见性、总数/分页、分批回填与并发写入。
独立审查的两个需求问题（旧学校占位数据回退、并发回填验证）均已修复并补测试，
规范审查没有硬性违规；另采纳了直接覆盖派生字段时也应重建的加固建议。

验证结果：

- `bun run check`、`bun run typecheck`（8 个包）通过。
- 两端实际 DAO 与隔离 PostgreSQL 回归共 4 个文件、71 项测试通过。
- Web 658 项、桌面端 162 项、shared 462 项、worker 81 项及两个队列包 44 项通过。
- Python Ruff 检查和格式检查通过，pytest 146 项通过。
- 全量后端复跑仍未全绿：1564 通过、6 失败、24 跳过（上述专用数据库测试另行全部通过），
  另有一个认证配置导致的套件加载失败；补齐仅用于测试的虚拟 OAuth 参数后该套件单独通过。
  临时数据库切到 UTC、提供测试签名密钥后，最初的孤儿恢复及会议链接测试失败已消失。

剩余 6 个失败位于本次未修改的测试及对应业务逻辑中，与起始提交相比这些文件没有差异：
`job-description-match-agent.test.ts` 的旧 JD 提示断言（1），
`lifecycle-write-boundary.test.ts` 的旧岗位升级/草稿流程断言（2），
`job-description-code.test.ts` 中旧表单字段（2），
`resumes/__tests__/route-behavior.test.ts` 中缺少 onConflictDoNothing 的事务 mock（1）。
本次未为搜索功能修改这些无关流程；全仓测试通过不是本次已达成的结论。
