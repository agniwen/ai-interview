# meeting-intelligence

消费会议智能分析队列：生成会议摘要等分析结果。用执行令牌和租约保护生成过程，复用持久化的 checkpoint，只有模型快照匹配时才发布结果。

## 边界

- 分析实现在 `@app/meeting-processing/intelligence`；队列契约在 `@app/job-queues/meeting-intelligence`。
