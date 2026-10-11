# human-interview-recording

消费人工面试录制队列：校验 LiveKit 轨道录制文件，归一化成可转写的音频并存入对象存储，然后投递转写任务。启动时还会对账未完成的录制任务。

## 边界

- 轨道录制的业务状态（开始、停止、对账）在 `@app/recruiting-workflows/human-interviews`；媒体处理用 `@app/meeting-media`；对象存储用 `@app/object-storage`。
- 这里只负责队列消费、重试和资源清理。
