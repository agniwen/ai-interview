# human-interview-evaluation

消费人工面试评价队列：基于会议转写生成面试评价草稿，完成后通过 `@app/recruiting-workflows/notifications/human-evaluation-ready` 发出"评价已就绪"通知。

## 边界

- 评价生成和持久化在 `@app/meeting-processing/human-interview`；这里只组合生产依赖（数据库、AI provider、通知）和队列处理流程。
- 队列名和 payload 归 `@app/job-queues/human-interview-evaluation` 所有。
