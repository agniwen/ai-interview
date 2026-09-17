# 架构决策记录（ADR）

本目录保存影响架构与产品边界的决策记录。改代码前先查这里，避免重复推翻已经确认过的约束。

## 约定

- 文件名使用 `NNNN-<slug>.md`，编号连续，不因废弃而回收。
- 每个 ADR 用 YAML frontmatter 声明 `status`：`accepted`，或被取代时写 `superseded by ADR-NNNN`。
- 被取代的 ADR 保留在目录中作为历史记录，不要删除；正文不要改写，新决策写新的编号。

## 索引

| ADR                                                                                                                                     | 状态                   | 首次提交   |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------- |
| [Use workspaces for recruiting tenancy](0001-use-workspaces-for-recruiting-tenancy.md)                                                  | accepted               | 2026-07-04 |
| [Keep resume library and AI interview rounds separate](0002-keep-resume-library-and-ai-interview-rounds-separate.md)                    | accepted               | 2026-07-04 |
| [Use chat attachments as the resume byte registry](0003-use-chat-attachments-as-the-resume-byte-registry.md)                            | accepted               | 2026-07-04 |
| [Keep Postgres as the source of truth for semantic resumes](0004-keep-postgres-as-source-of-truth-for-semantic-resumes.md)              | accepted               | 2026-07-04 |
| [Index resumes with three semantic chunks](0005-index-resumes-with-three-semantic-chunks.md)                                            | accepted               | 2026-07-04 |
| [Make resume pool readiness include semantic vectors](0006-make-resume-pool-readiness-include-semantic-vectors.md)                      | accepted               | 2026-07-04 |
| [Use resume pool as pre-library staging](0007-use-resume-pool-as-pre-library-staging.md)                                                | accepted               | 2026-07-04 |
| [Use database-backed resume upload batches](0008-use-database-backed-resume-upload-batches.md)                                          | accepted               | 2026-07-04 |
| [Ingest mail attachments into the private resume pool](0009-ingest-mail-attachments-into-the-private-resume-pool.md)                    | accepted               | 2026-07-04 |
| [Support shared workspace invite links](0010-support-shared-workspace-invite-links.md)                                                  | accepted               | 2026-07-04 |
| [Log round invite email sends](0011-log-round-invite-email-sends.md)                                                                    | accepted               | 2026-07-04 |
| [Store global interview config per workspace](0012-store-global-interview-config-per-workspace.md)                                      | accepted               | 2026-07-04 |
| [Make chat a workspace recruiting copilot](0013-make-chat-a-workspace-recruiting-copilot.md)                                            | accepted               | 2026-07-04 |
| [Use confirmed resume screening policies](0014-use-confirmed-resume-screening-policies.md)                                              | accepted               | 2026-07-08 |
| [Scope public resume pool to the workspace](0015-scope-public-resume-pool-to-workspace.md)                                              | accepted               | 2026-07-16 |
| [Resume scoring policies as workspace-owned dimension weight configs](0016-resume-scoring-policies.md)                                  | superseded by ADR-0020 | 2026-07-17 |
| [Single user-facing resume evaluation decision](0017-single-resume-evaluation-decision.md)                                              | superseded by ADR-0025 | 2026-07-17 |
| [Use round-scoped evidence-backed interview reports](0018-use-round-scoped-evidence-backed-interview-reports.md)                        | accepted               | 2026-07-22 |
| [Use a question TaskGroup for AI interviews](0019-use-a-question-task-group-for-ai-interviews.md)                                       | accepted               | 2026-07-26 |
| [Store resume scoring configuration on job descriptions](0020-store-resume-scoring-config-on-job-descriptions.md)                       | accepted               | 2026-07-28 |
| [Make saved job hard gates active](0021-make-saved-job-hard-gates-active.md)                                                            | superseded by ADR-0023 | 2026-07-28 |
| [Isolate legacy and structured resume evaluation](0022-isolate-legacy-and-structured-resume-evaluation.md)                              | accepted               | 2026-07-29 |
| [Publish and freeze structured job evaluation](0023-publish-and-freeze-structured-job-evaluation.md)                                    | accepted               | 2026-07-29 |
| [Compute structured resume scores from versioned deductions](0024-compute-structured-resume-scores-from-versioned-deductions.md)        | accepted               | 2026-07-29 |
| [Keep AI resume evaluation advisory to the recruiter decision](0025-keep-ai-resume-evaluation-advisory.md)                              | accepted               | 2026-07-29 |
| [Store structured resume evaluation separately from legacy review v4](0026-store-structured-resume-evaluation-separately.md)            | accepted               | 2026-07-29 |
| [Allow an explicit legacy-job upgrade to structured evaluation](0027-allow-legacy-job-structured-upgrade.md)                            | accepted               | 2026-08-04 |
| [Use local-first desktop capture for Echo](0028-use-local-first-desktop-capture-for-meeting-buddy.md)                                   | accepted               | 2026-08-09 |
| [Version qualitative resume evaluation without converting historical results](0029-version-qualitative-resume-evaluation.md)            | accepted               | 2026-08-25 |
| [Use a guarded general professional evidence standard when the JD is silent](0030-use-guarded-general-professional-evidence.md)         | accepted               | 2026-08-25 |
| [Save job descriptions without a draft-and-publish lifecycle](0031-save-job-descriptions-without-a-draft-publish-lifecycle.md)          | accepted               | 2026-08-25 |
| [一次性统一列表筛选，不保留旧筛选协议兼容层](0032-replace-list-filtering-in-one-coordinated-release.md)                                 | accepted               | 2026-08-26 |
| [Synchronize system-owned Feishu review sections](0033-synchronize-system-owned-feishu-review-sections.md)                              | accepted               | 2026-08-27 |
| [Use interviewer invite links for candidate-materials access](0034-use-interviewer-invite-links-for-candidate-materials-access.md)      | accepted               | 2026-08-28 |
| [Use Effect for worker orchestration](0035-use-effect-for-worker-orchestration.md)                                                      | accepted               | 2026-09-02 |
| [Copy recruiting data into independent tables before switching runtime ownership](0036-copy-recruiting-data-into-independent-tables.md) | accepted               | 2026-09-07 |
| [Share one Feishu evaluation document per recruiting record](0037-share-feishu-evaluation-document-per-recruiting-record.md)            | accepted               | 2026-09-07 |
| [Support recorded human initial interviews](0038-support-recorded-human-initial-interviews.md)                                          | accepted               | 2026-09-08 |
| [Run Echo processing durably on the recording device](0039-run-echo-processing-durably-on-device.md)                                    | accepted               | 2026-09-09 |

## 设计文档（非 ADR）

以下文件是设计文档，不是决策记录。它们因历史原因留在 `docs/adr/` 下，不构成架构约束；新的设计文档请放到 `docs/plans/` 或 `docs/research/`。

| 设计文档                                                                               | 首次提交   |
| -------------------------------------------------------------------------------------- | ---------- |
| [候选人收集信息 → 表单/面试题分区展示](2026-07-07-collected-info-split-design.md)      | 2026-07-08 |
| [候选人回答关键词自动高亮](2026-07-08-answer-keyword-highlight-design.md)              | 2026-07-08 |
| [邮件入库可观测性](2026-07-09-mail-ingest-observability-design.md)                     | 2026-07-09 |
| [邮件入库日志 UI（Plan B）](2026-07-10-mail-ingest-log-ui-design.md)                   | 2026-07-10 |
| [岗位人才推荐评测集与基线度量](2026-07-10-recommendation-eval-harness-design.md)       | 2026-07-10 |
| [JD 编码形状去重](2026-07-13-jd-code-shape-dedup-design.md)                            | 2026-07-13 |
| [无编码岗位推荐（简历 → Top-N JD）](2026-07-13-jd-recommendation-for-resume-design.md) | 2026-07-13 |
