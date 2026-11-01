# interview-notifications

面试通知投递 Worker：定时认领通知事件，并通过飞书卡片、邮件等渠道投递；投递有租约、重试和状态检查。

## 职责

- `scheduler.ts`：轮询间隔、批量大小和租约。
- `processor.ts`：认领、渲染、投递，并记录结果。
- `channel-adapters.ts`、`providers.ts`：飞书和邮件渠道适配。
- `notification-presentation.tsx`：通知内容的展示模型。
- `dao.ts`、`default-dependencies.ts`：Worker 侧的数据访问与生产依赖组合。

## 边界

- 通知事件的产生、模板和投递准备在 `@app/recruiting-workflows/notifications`；AI 面试报告通知和 Offer 审批通知分别来自该包的 `ai-interview-reports` 和 `offer-approvals`。
- 本目录不决定"什么时候该通知谁"，只负责可靠投递。
