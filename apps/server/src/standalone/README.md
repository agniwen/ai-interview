# standalone

Server 独立运行（`bun src/index.ts`）时的进程适配：加载 `apps/server/.env*`、读取监听配置、管理启动与关闭的生命周期。

## 边界

- 只在独立进程模式下使用。由 Web 挂载时，环境变量和生命周期由 Web 宿主负责。
- 两种模式共用同一个 `createServerApp()`，不要在这里分叉路由行为。
