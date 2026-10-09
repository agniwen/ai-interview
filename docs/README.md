# 文档导航

当前操作与架构以源码、包清单、环境 schema 和以下维护文档为准。最后整理：2026-10-09。

## 当前指南

- [仓库启动与命令](../README.md)、[项目与数据模型介绍](project-introduction.md)
- [运行时与包边界](agents/runtime-boundaries.md)、[Server 架构](agents/server-architecture.md)
- [环境配置](agents/environment.md)、[语音 Agent](../apps/livekit-agent/README.md)
- [简历评价契约](agents/resume-evaluation.md)、[列表筛选](reui-filters.md)、[搜索索引维护](resume-keyword-search-rollout.md)
- [人工确认 AI 邀请邮件](manual-ai-invitation.md)、[真人面试候选人邮件](manual-human-interview-email.md)
- [本地 LiveKit](../infra/livekit-local/README.md)、[本地任务 Redis](../infra/queue-local/README.md)
- [会议处理容量验证](operations/meeting-buddy-capacity.md)、[Qwen Realtime 运维](operations/qwen-realtime-agent.md)
- [远程 MCP](integrations/remote-mcp.md)
- [首页背景](design/home-multicolor-artwork.md)、[面试入口背景](design/interview-preparation-artwork.md)、[品牌图标](design/light-brand-icon.md)

各应用和共享包的 README 描述各自入口与职责；[AGENTS.md](../AGENTS.md) 是编码约定的共同来源。

## 决策与历史记录

- [ADR 索引](adr/README.md) 记录决策与取代关系。历史决策正文保留，不把旧结论改成新结论。
- `plans/`、`superpowers/` 保存当时的实施方案，不是当前待办列表或可直接运行的维护脚本。重新执行前要核对当前代码和对应 ADR；旧评分、发布与升级流程已有定性评价契约取代。
- `research/` 是注明时间的调研结论，外部 API、版本和价格需重新核实。
- `verification/`、`reports/` 保存当时测试范围、环境及结果；通过记录不代表当前版本或生产部署已经验证。
- [LiveKit 生产现场记录](operations/livekit-human-interview-production.md) 是历史部署快照；当前配置从环境示例与部署配置读取。

历史文件中的旧路径、截图与命令用于还原当时上下文。查找当前实现时使用本页的维护指南，避免照抄旧目录或业务表名。
