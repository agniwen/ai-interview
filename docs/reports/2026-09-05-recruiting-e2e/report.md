# 招聘流程 E2E 验证报告

验证日期：2026-09-05；环境：本地 Web + `ainterview-dev` 开发库，工作区 `default`。

## 结论

完整成功路径、结束后回退重评、筛选淘汰后回开、跳过 AI 直接复试和列表删除均已通过浏览器实际点击验证。发现并修复 2 个业务问题，修复后回到浏览器复验通过。5 个一级阶段及其共 22 个筛选视图已逐个点击核对，并由真实分页 DAO 复核。

[主流程验证记录](http://localhost:3000/w/default/studio/resumes/b212f1da-6898-4fbf-8c47-10e346c4d173?stage=closed%3Ahired&page=1) 最终为已结束／已入职，版本 28。8 个业务节点均 completed/pass，34 条招聘事件保留。

## 验证方法与边界

- 从已有简历复制新测试记录；原招聘记录及旧存档表未修改。
- 主记录从简历筛选开始。所有阶段推进、评价确认、Offer 操作、结束及回退都通过浏览器点击完成，没有用数据库命令代替推进。
- 按授权，仅对已经由 UI 到达的 AI 初面、复试、终试节点，插入模拟完成轮次并绑定有效证据，使其处于待人工确认状态；随后在 UI 中填写评价和确认通过。
- 未实际进行语音 AI 面试或真人视频会议，未验证录音、转录与自动评价生成。复试准备题生成弹窗实际运行并确认通过。
- Offer“已发出”仅记录业务状态；未发送邮件或短信。主记录通知接收人、通知事件、投递及已发送数量均为 0。
- 展示样例由数据库构造，不能计作浏览器推进证据；已验证完整简历结构和节点、轮次、Offer 关联。
- 本轮是桌面浏览器业务 E2E；未覆盖真实手机、移动端键盘及不同设备视觉效果。

## 实际操作结果

| 环节         | 浏览器操作与结果                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 简历筛选     | 点击“推进 AI 初面”，自动通过筛选，进入 AI 初面；未处理时隐藏回退按钮。                                                                                 |
| AI 初面      | 模拟轮次完成后填写 Markdown 评价，确认通过，再点击进入复试。                                                                                           |
| 复试         | 完成准备题弹窗；模拟面试完成、填写评价、确认通过，点击进入终试。                                                                                       |
| 终试         | 模拟完成后填写评价、通过，点击进入流水提供。                                                                                                           |
| 薪资流水     | 系统 Select 选择“进行中”并保存；重新打开填写审核说明、确认通过，点击进入谈薪。                                                                         |
| Offer        | 创建 v1 ¥20,000 草稿、标记已发出、记录议价；创建 v2 ¥22,000、标记已发出、记录接受。v1 被替代，v2 accepted。接受后仍须点击进入背调。                    |
| 背调         | 人工确认通过后点击进入入职；回退重评时发现并修复弹窗生命周期问题。                                                                                     |
| 入职         | 填写确认说明、点击确认入职，流程闭环。                                                                                                                 |
| 回退及重评   | 从已结束回到背调，目标及下游有效状态重置；进入入职重新禁用，复核通过后才能继续。旧评价和 Offer 历史保留。修复后无需刷新或打开其他弹窗即可继续。        |
| 筛选失败分支 | 独立记录筛选淘汰 → 已结束 → 重新激活至筛选未处理 → 直接安排复试，验证跳过 AI 的入口。                                                                  |
| 谈薪结束归属 | 谈薪中标记放弃后仍出现在“谈薪”，不会出现在“发 Offer”；随后回开并恢复谈薪中。                                                                           |
| 活动记录     | 浏览器确认筛选通过、逐阶段推进、评价、Offer 创建／发出／议价／接受等均可见；最终 DB 保留 34 条主记录招聘事件。                                         |
| 删除         | 列表只保留批量删除；通过确认弹窗删除分支专用记录，列表与浮动栏及时更新。招聘记录及 22 类关联表计数为 0。人才身份与简历资产各保留 1，符合当前保留设计。 |

## 发现并修复的问题

### 1. 谈薪中结束后误归“发 Offer”

关闭操作将当前节点统一置为 completed，原筛选把 completed 当成发 Offer 进度，导致谈薪中放弃／归档错误移入“发 Offer”。

现在关闭时保存关闭前进度；列表按关闭前进度判断子阶段。旧记录从关闭事件节点快照恢复，无需数据回填。新增边界测试先复现失败再通过。浏览器实测谈薪中放弃仍在谈薪，发 Offer 列表排除该记录。

涉及：`packages/database/src/recruiting-pipeline.ts`、`apps/server/src/server/routes/studio/routes/resumes/dao/board-filter.ts` 及集成测试。

### 2. 人工确认后下一步按钮偶发无响应

确认组件的 React key 包含记录 version，提交刷新后强制卸载仍打开的 Dialog；完成节点又立即返回 null，打断正常关闭。实际表现为背调通过后按钮已启用，点击不能推进，另开关闭弹窗或刷新后恢复。

现改为稳定记录 ID key，保留 Dialog 生命周期，仅隐藏不可操作的触发按钮；成功时先关闭弹窗再刷新。浏览器重新执行“回退背调 → 确认通过 → 直接进入入职”通过，无需刷新。

涉及：`studio-person-detail-header.tsx`、`recruiting-node-actions.tsx`，以及 Dialog 和 floating bar 交互回归测试。

数据准备期间还发现自建样例缺少简历数组字段，已仅修正这些测试样例；21 条保留样例全部通过 resumeProfileSchema 校验。这不计作业务代码修复。

## 自动化验证

- 招聘台 SQL／真实分页 DAO 边界：11 项通过。
- 主流程及真人流程集成测试：20 项通过。
- 写入、并发、删除与引用保留：15 项通过。
- 活动记录：本轮 4 项通过。
- 新增弹窗／按钮生命周期及相关规则：14 项通过。
- Web、Server、database 类型检查通过；修改范围格式／lint 及 git diff --check 通过。
- 最终开发库只读复核：21 条样例保留，22/22 筛选视图匹配。详细证据见 [最终验证数据](final-verification.json)。

## 保留的阶段样例

共 21 条，名称均以 E2E阶段样例- 开头。另保留上述已入职的主 E2E 记录。分支删除专用记录已删除。

“全部”由各子阶段自然覆盖；已结束记录按原阶段保留归属，同时进入已结束结果分类，因此跨一级标签看到同一记录是预期行为。

| 样例                     | 筛选视图               | 链接                                                                                        |
| ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------- |
| E2E阶段样例-筛选未处理   | `screening:pending`    | [打开](http://localhost:3000/w/default/studio/resumes/8b1ce2ea-5da9-4bfa-bb22-db28b6088d29) |
| E2E阶段样例-筛选合格     | `screening:pass`       | [打开](http://localhost:3000/w/default/studio/resumes/d8ce01cf-6283-4dfe-8419-e15365fb0bf8) |
| E2E阶段样例-筛选淘汰     | `screening:fail`       | [打开](http://localhost:3000/w/default/studio/resumes/592f073e-861f-4233-8cc1-9d0a88985113) |
| E2E阶段样例-AI初面待评价 | `interview:ai`         | [打开](http://localhost:3000/w/default/studio/resumes/d7544303-cdb8-4e93-adcb-58d9c6359d9e) |
| E2E阶段样例-复试待评价   | `interview:second`     | [打开](http://localhost:3000/w/default/studio/resumes/05f54835-d2cb-43a1-ab00-8fcbb322cd49) |
| E2E阶段样例-终试待评价   | `interview:final`      | [打开](http://localhost:3000/w/default/studio/resumes/b14c15f1-c63d-4b7c-aefc-ddf585739759) |
| E2E阶段样例-流水待审核   | `offer:income`         | [打开](http://localhost:3000/w/default/studio/resumes/0c25fdb5-3139-43fe-88ff-797940d95e21) |
| E2E阶段样例-谈薪中       | `offer:negotiating`    | [打开](http://localhost:3000/w/default/studio/resumes/8398514a-9f20-4e53-aad8-faa362a261ac) |
| E2E阶段样例-Offer待发出  | `offer:send`           | [打开](http://localhost:3000/w/default/studio/resumes/166889ec-be82-4eef-a2a8-7e1d06d83b87) |
| E2E阶段样例-Offer待回复  | `offer:send`           | [打开](http://localhost:3000/w/default/studio/resumes/4f04224e-b00d-49ad-a12f-e76755de9237) |
| E2E阶段样例-Offer已接受  | `offer:send`           | [打开](http://localhost:3000/w/default/studio/resumes/fb0a6f74-a57a-4c62-b7f7-6b669a018648) |
| E2E阶段样例-背调待确认   | `offer:background`     | [打开](http://localhost:3000/w/default/studio/resumes/1d63368e-82d0-45d1-9aa0-712dbe7990c0) |
| E2E阶段样例-待入职       | `onboarding:pending`   | [打开](http://localhost:3000/w/default/studio/resumes/43ccd331-7464-4890-a2ec-8ce748ed3f3b) |
| E2E阶段样例-入职放弃     | `onboarding:withdrawn` | [打开](http://localhost:3000/w/default/studio/resumes/2d800242-3020-4bf2-bd45-cead51318820) |
| E2E阶段样例-已入职       | `onboarding:hired`     | [打开](http://localhost:3000/w/default/studio/resumes/7492cb0d-e770-4581-a5b4-cb99bb91cfb6) |
| E2E阶段样例-已归档       | `closed:archived`      | [打开](http://localhost:3000/w/default/studio/resumes/65cdcae9-752f-4c80-940a-88f128414dbb) |
| E2E阶段样例-AI初面淘汰   | `interview:ai`         | [打开](http://localhost:3000/w/default/studio/resumes/388d32a7-a405-4096-a756-d29cef485e60) |
| E2E阶段样例-复试淘汰     | `interview:second`     | [打开](http://localhost:3000/w/default/studio/resumes/ec450909-14c4-42ed-af49-902961009588) |
| E2E阶段样例-终试放弃     | `interview:final`      | [打开](http://localhost:3000/w/default/studio/resumes/6561f862-38fe-475d-a19f-d45ffc17b09c) |
| E2E阶段样例-谈薪失败     | `offer:negotiating`    | [打开](http://localhost:3000/w/default/studio/resumes/f3823779-3618-4d66-b77a-2ab933a0cfd4) |
| E2E阶段样例-背调异常     | `offer:background`     | [打开](http://localhost:3000/w/default/studio/resumes/7e38563f-ed4e-4fe4-8ab3-ae3255409ddc) |

完整清单及 DAO 验证结果：[阶段样例清单](stage-fixtures.json)。本轮未提交、推送或部署代码。
