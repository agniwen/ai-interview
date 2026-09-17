# 招聘数据复制回填

此工具默认允许显式指定的开发库 `ainterview-dev`；生产库 `ainterview` 写入必须同时传入 `--database ainterview --confirm-database ainterview`。配置连接、实际连接数据库及显式目标必须一致。额外参数仅防止误操作，不代替备份、停写及迁移顺序核查。执行使用已有的 Node/tsx 和 Web 迁移环境的 `pg` 驱动；不通过业务 ORM 实例进行运维写入。数据库连接来自 Web 当前 Drizzle 配置；不会输出连接串。

```sh
# 只读预检，不写数据库
apps/server/node_modules/.bin/tsx apps/server/src/scripts/migrate-recruiting-data.ts \
  --database ainterview-dev \
  --infer-legacy-nodes \
  --report /tmp/recruiting-preflight-report.json

# 受控维护窗口内复制并校验；新表循环外键在同一事务内分两阶段补齐
apps/server/node_modules/.bin/tsx apps/server/src/scripts/migrate-recruiting-data.ts \
  --database ainterview-dev \
  --infer-legacy-nodes \
  --source-cache /tmp/recruiting-private-source-cache.json \
  --report /tmp/recruiting-migration-report.json \
  --apply
```

`--infer-legacy-nodes` 仅用于用户已授权对历史含糊值自主判断的这次迁移。明确终面/终试归终面，明确复面/复试归复试；高层面试且流程已经进入 Offer 时归终面，其他名称保守归复试。原始名称、轮次 outcome 和全部旧主表内容保留，推断理由写入报告和迁移事件，不补造中间节点的通过结果。可用 `--mapping <file>` 提供 `humanRoundKinds` 和 `recordNodes` 的逐条覆盖。

维护窗口必须同时停止旧 Server/Worker 中的定时消费，包括飞书文档同步。用户没有打开页面不代表后台停止。工具在事务内对全部源表加 SHARE 锁，对目标表加 SHARE ROW EXCLUSIVE 锁，期间源表写入会等待。事务提交之后这些锁释放，工具不会停止或重启任何服务。

大字段通过数据库内 `INSERT SELECT` 从锁定的源行复制，网络只传源身份、字段映射和新节点等少量字面量；参数按 UTF8 字节限制在 128 KiB / 100 条以内，单条超限时单独处理。源表和目标表作为同组查询依据时必须包含来源表名，不能把不同评估来源混入同一复制语句。

工具按表记录数据库端 SHA-256 基线，完成后核对源表未变、目标每个显式字段相等，再写迁移台账。台账同时保存来源及映射哈希、目标行哈希。重复运行只能验证已经复制的同一数据；发现源变化、映射变化、目标业务更新、目标被删或无台账的同 ID 行都会拒绝覆盖。不能在切换后把本工具当作旧表到新表的持续同步工具。

`--source-cache` 是减少远程大 JSON 重复下载的可选私有快照，包含候选人信息和评估内容，文件以 `0600` 权限创建。它只在数据库基线和文件内容校验同时匹配时复用；源改变后工具拒绝使用旧缓存。报告只有表计数、哈希、迁移身份和映射理由，不包含简历正文或数据库凭据。不要把缓存或报告提交到 Git。

`--rollback-test` 可与 `--apply` 一起执行完整复制与数据库约束检查后主动回滚。任何错误也会回滚整个事务；源表没有 INSERT/UPDATE/DELETE，只有新建目标行的循环引用会 UPDATE。

迁移事件 `migration.source_copied.detail.legacySource` 保存旧主表完整历史快照，仅用于审计。新业务不能用它恢复覆盖活跃字段。评估 `artifact` 保持原契约：成功历史版本原样复制，当前产物不存在历史版本时生成独立稳定 ID；失败/排队尝试和上次成功结果分别保留，筛选规则历史使用 `kind=resume_screening`。
