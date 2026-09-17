# 招聘旧表退役审计

审计日期：2026-09-07。代码：当前 `next-version` 工作区；数据库：开发库 `ainterview-dev`。本次仅做只读数据库检查，没有删除、清空、改约束或修改业务代码。

## 清理状态更新

本审计发现的数据库与类型遗留已于 2026-09-07 在开发库处理。25 条报告/版本归档到新事件，三张额外表 18 条外键和旧主表 2 个触发器已移除，在线旧表类型依赖已解除；旧表/旧行保留。执行与一个月后的删除步骤见 [merge-new-table 第 9 节](./merge-new-table.md)。以下内容保留为**清理前的审计基线**，不代表清理后的现状。

## 清理前结论

原迁移清单内 33 张旧表未发现在线业务直接读写，新的业务关系也未发现指向旧表。**当前仍未达到“所有旧引用均清理，可直接删表”的状态**：存在旧 schema/类型依赖，以及代码 schema 之外的真实数据库遗留表和外键。

不能把这次开发库结果当作生产环境审计；旧版本进程、其他部署、外部脚本需要在实际切换环境检查。

## 检查范围与结果

- 从 `apps/server/src/scripts/recruiting-migration/model.ts` 的 `sourceNames` / `tableCopies` 读取准确的 33 张旧表名单。
- 扫描 apps/packages 中旧 Drizzle 符号和物理表名，检查业务、Worker、Python Agent、维护脚本、类型、relations；迁移历史单独分类。
- 现有 `runtime-boundary.test.ts` 通过：生产 TypeScript 中没有命中旧表运行时具名 import 和直接 SQL 查询。此正则测试不等同于数据库审计，未覆盖的额外数据库对象由本次目录查询补查。
- 当前 relations 中，非归档实体未发现指向这 33 张旧表的关系；旧表之间的 relations 仍保留。
- 开发库查询 pg_constraint / pg_trigger / pg_depend / pg_proc：33 张源表存在，内部外键 49 条；外部表指入外键 7 条；无依赖视图、无按表名匹配的自定义函数体；旧主表有 2 个触发器。

## 实际数据库遗漏

以下三表不在当前 33 张迁移清单中，也未在当前源码 schema 或迁移文件中找到对应表定义/直接读写；属于实际数据库与代码声明不一致的遗留对象。

| 实际数据库表                                    | 当前行数 | 对旧表的外键                                                                          |
| ----------------------------------------------- | -------: | ------------------------------------------------------------------------------------- |
| `interview_report`                              |       12 | `studio_interview`、`studio_interview_schedule`                                       |
| `interview_report_version`                      |       13 | `interview_context_snapshot`、`interview_evidence_snapshot`、`interview_conversation` |
| `studio_human_interview_interviewer_invitation` |        0 | `studio_human_interview_meeting` 的单列及复合外键，共 2 条                            |

前两表含真实数据，不能因为当前代码不用就认定已经迁移。这 25 条报告/版本记录需要对照新会话与评价内容确定保留策略；本次没有读取或公开报告正文，也没有判定可以丢弃。三表还保留对在线 user/organization 等对象的引用，应纳入归档解耦审计。

直接 DROP 被引用旧表会受依赖限制；使用 CASCADE 会移除依赖约束等对象，不能代替明确的退役迁移。

## 旧主表触发器

- `studio_interview_skill_count_decrement`：BEFORE DELETE，调用 `decrement_studio_org_skill_counts()`，修改在线 `studio_org_skill.candidate_count`。说明归档旧行仍能通过数据库触发器影响在线数据；之前解除外键没有解除这一联系。
- `studio_interview_sync_search`：BEFORE INSERT/UPDATE，调用 `sync_resume_search_fields()` 更新旧行的搜索字段。

DROP TABLE 不执行逐行 DELETE 触发器；不要先 DELETE 旧行“清空”再删表，否则技能计数触发器会执行。共享函数需检查其他调用方，不能因为删除旧表就一起移除。

## 代码中仍保留的引用

### 需要在删除旧 schema 前解开

- `packages/database/src/recruiting-read-model.ts`：`typeof studioInterview.$inferSelect` 用作投影字段类型。
- `packages/database/src/recruiting-records.ts`、`recruiting-assessment.ts`：用旧表推导写入兼容字段类型。
- `packages/db-schema/src/schema.ts`、`relations.ts`：保留已弃用实体及归档内部关系。
- `apps/server/src/scripts/recruiting-migration/`：真实读取旧表的迁移/预检代码，删表后不再能运行；保留历史文件可以，但应明确退役执行入口。

以上类型引用不会查询旧物理表，但直接移除旧 Drizzle 定义会让编译失败。应先将兼容字段契约独立定义或从新模型推导。

### 旧名字仍在线使用，但不读取旧表

- Qdrant 与语义队列中的 `sourceType: "studio_interview"` 及点/任务标识仍作为兼容协议值使用；新数据库侧通过 `db-source.ts` 映射为 `recruiting_record`，indexer 实际读取新表投影。
- `resumeUploadBatch` 等权限资源名、`resume_pool_import` 等事件值不等于数据库访问。
- 部分注释、错误文案、旧邀请链接说明仍写旧表名。

物理删表无需先迁移这些协议值。若目标是全仓库连旧命名也不保留，应另行迁移向量 payload/ID、任务去重键及兼容解析，不能只做字符串替换。

## 一个月观察期与最终删除顺序

1. 将上述 3 张额外表、2 个触发器纳入退役范围，先核对有数据的报告与版本去向，再清理遗留在线依赖。
2. 解开在线代码对旧 Drizzle 类型的依赖；旧 schema 和迁移文件可在观察期保留，但不要再作为在线实现依据。
3. 从目标环境所有 Web/Server/Worker/Agent 均切到新版本、旧消费者停止时开始计算观察期；“没人打开页面”不代表旧任务停止。
4. 在该环境用数据库查询日志/审计或可用的 pg_stat_statements 观察旧表访问。本次未启用持续监控，静态扫描与单次目录查询不能证明未来一个月零访问。
5. 一个月后复查数据保留、依赖和访问记录，做可恢复备份，再用明确的退役迁移删除选定旧表并同步移除 schema/relations。历史 SQL 迁移一般保留，再追加退役迁移，保证新环境可以重放完整迁移链。

本次没有执行上述清理或删除。详细映射与切换步骤见 [merge-new-table](./merge-new-table.md)。
