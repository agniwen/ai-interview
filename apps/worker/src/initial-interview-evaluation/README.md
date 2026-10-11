# initial-interview-evaluation

启动初面评估队列的消费者，并在启动时恢复未完成的初面评估版本。

## 边界

- 评估生成、发布到飞书文档和恢复逻辑都在 `@app/recruiting-workflows/initial-interviews`；本目录只管理队列 Worker 的启动和关闭。
