# JD 匹配 Agent 合成评测

该评测用于验证“结构化简历 → 候选 JD Top-1”Agent 的输出契约和合成边界判断。它不读取真实候选人数据，也不能替代真实招聘结果上的准确率评测。

默认命令只列出 8 个脱敏案例，不调用模型：

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend eval:jd-match:synthetic
```

案例覆盖：目标岗位与技能直接匹配、缺少目标岗位但技能明确、业务领域匹配、职级差异、测试开发、SRE、简历与 JD 描述提示词注入、仅有目标岗位等信息缺失场景。

显式执行会产生模型调用：

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend eval:jd-match:synthetic -- \
  --execute --runs 3 --strict
```

可使用 `--case <id>` 只运行一个案例，使用 `--output <directory>` 修改输出目录。默认结果写入 `.eval/`，包括逐次运行 JSONL、指标 JSON 和 Markdown 报告。

`--strict` 要求每个案例至少运行 3 次，并执行以下护栏：

- 结构成功率 100%；
- 候选 ID 合法率 100%；
- 预期 Top-1 命中率至少 90%；
- 重复选择一致率至少 80%；
- 理由证据覆盖率至少 80%。

这些阈值只用于合成回归。真实 Top-1 准确率、无匹配策略和业务收益需要在脱敏金标数据成熟后重新评估。
