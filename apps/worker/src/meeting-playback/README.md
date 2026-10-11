# meeting-playback

消费会议回放队列：用 ffmpeg 生成可回放的媒体文件，存入对象存储，并在需要时投递转写任务。失败时会保留截断后的 ffmpeg 输出，便于诊断。

## 边界

- 媒体处理工具在 `@app/meeting-media`；队列契约在 `@app/job-queues/meeting-playback`。
