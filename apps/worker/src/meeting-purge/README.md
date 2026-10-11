# meeting-purge

消费会议清理队列：删除会议录音等对象存储文件并校验删除结果。每批最多并发 8 个对象，以控制对象存储的压力。

## 边界

- 清理规则和数据库状态在 `@app/meeting-processing/purge`；队列契约在 `@app/job-queues/meeting-purge`。
