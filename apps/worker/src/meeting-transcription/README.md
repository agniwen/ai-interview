# meeting-transcription

消费会议转写队列：下载音轨（单条超过 8 小时的音轨会被拒绝），调用转写 provider（如 Qwen ASR），发布转写结果，并触发后续的智能分析和人工面试评价。

## 边界

- 转写 provider、发布和搜索投影在 `@app/meeting-processing/transcription`；队列契约在 `@app/job-queues/meeting-transcription`。
