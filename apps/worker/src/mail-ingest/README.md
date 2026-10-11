# mail-ingest

邮件导入 Worker：按配置轮询 IMAP 邮箱，过滤出简历附件并导入私有简历池；支持手动触发，同一进程内不会并发扫描同一批邮箱。

## 边界

- 导入、查重和账号密钥解密在 `@app/resume-processing`（`./ingest`、`./mail-ingest`、`./mail-ingest-crypto`）；这里只负责邮箱连接、调度和附件过滤。
- 不移动或删除源邮箱中的邮件。
