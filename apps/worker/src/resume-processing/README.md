# resume-processing

把 `@app/resume-processing` 的 ingest、review、semantic 工厂绑定到 Worker 自己的数据库（`src/db.ts`），供简历相关队列的消费者使用。

## 边界

- 只做数据库绑定，不写业务逻辑；简历处理实现都在 `@app/resume-processing`。
