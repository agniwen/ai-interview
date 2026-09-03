# @app/resume-processing

简历领域的可复用处理包，承载导入、解析、评估、语义索引、查重、邮件导入和相关应用流程，供 Server 与 Worker 通过显式数据库注入共同使用。

## 主要入口

- `./ingest`：上传批次、解析处理器和批量导入 workflow。
- `./review`：简历评估生成、重评和人才库评估。
- `./semantic`：简历/JD 语义索引、查重和生命周期。
- `./mail-ingest` / `./mail-ingest-crypto`：邮件导入 DAO 组合与密钥加解密。
- `./ingest/database-context`：宿主为迁入的 legacy/internal 模块绑定 `Database` 的边界。

## 职责与边界

- 完整业务动作接收显式输入和依赖，不接受 Hono Context 或浏览器对象。
- `createResumeIngest`、`createResumeReview`、`createResumeSemanticProcessing` 必须把所有访问共享 DB proxy 的公开操作绑定到宿主数据库。
- Server/Worker facade 只能导出绑定后的数据库操作；纯函数可以直接 re-export。
- schema 属于 `@app/db-schema`，跨应用产品契约属于 `@app/shared`，queue payload 属于 `@app/resume-parse-queue`。
- `src/internal/` 是实现组织，不是无约束公开 API；新增调用优先经过顶层 factory。

## 如何修改或新增

1. 先判断能力属于 ingest、review 还是 semantic，并把行为放在对应领域目录。
2. 需要 DB 的函数使用共享 database context；加入顶层 factory 并在 Server/Worker 组合处导出绑定版本。
3. 新增 factory 方法时写测试证明它在异步/并发调用中仍使用注入的数据库，避免 `database scope is unavailable` 回归。
4. 多步写入保持一个完整 verb 和清晰事务边界；外部 AI/storage/queue 通过 port 注入。
5. 只在确有跨包调用方时增加 `package.json.exports`，禁止调用方绕过 export 深挖 `src/internal`。
6. 提示词或评估输出变化需遵守根目录 ADR 和定性简历评估契约。

```bash
bun run --filter @app/resume-processing typecheck
bun run --filter @app/resume-processing test
```
