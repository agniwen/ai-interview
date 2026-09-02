# @app/meeting-media

会议录音规范化与转写音频准备包，把不同录音容器/声道输入转换成下游转写可以稳定消费的媒体结果。

## 职责与边界

- 识别和规范化会议媒体输入。
- 准备 provider-independent 的转写音频和相关元数据。
- 提供 Server 与 Worker 可复用的纯处理/外部命令边界。
- 不负责录音采集、对象存储生命周期、队列消费或转写 provider 调用。

## 如何修改或新增

- 新增容器或 codec 支持时，在 `src/index.ts` 的现有公共流程内扩展，并增加真实最小 fixture 测试。
- 需要系统二进制时，错误信息必须说明缺失依赖，且不要在 import 阶段执行探测或命令。
- 输出契约变化需同步 `@app/meeting-processing` 和 Worker 使用方。
- provider-specific 转码偏好属于对应 provider adapter，不应污染通用输出。

```bash
bun run --filter @app/meeting-media typecheck
bun run --filter @app/meeting-media test
```
