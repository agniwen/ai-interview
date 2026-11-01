# meeting-operations

为 Worker 的受保护运营诊断端点（`src/app.ts`）提供会议处理的容量与积压快照。

## 边界

- 只读查询，不改变任何业务状态。容量阈值必须和 Server 中同名的环境变量保持一致。
