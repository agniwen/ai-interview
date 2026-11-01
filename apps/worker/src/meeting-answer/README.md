# meeting-answer

消费会议问答队列：基于会议转写生成问答结果。

## 边界

- 生成逻辑和持久化在 `@app/meeting-processing/answer`；队列契约在 `@app/job-queues/meeting-answer`。
