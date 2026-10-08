import type { QualitativeResumeEvaluationV2 } from "@app/db-schema/qualitative-resume-evaluation";
import type { HumanInterviewEvaluationDraft } from "@app/db-schema/studio-interviews";
import type {
  HumanInterviewRoundRecord,
  HumanInterviewMeetingRecord,
  OfferDraftRecord,
} from "@app/shared/studio-pipeline-stages";

/** Local display fixtures only: no recruitment record, invitation, or meeting is persisted. */
export const demoEvaluation: QualitativeResumeEvaluationV2 = {
  conciseOverall:
    "真嗣有 8 年前端研发经验，主导微前端架构升级和性能治理，具备高级前端工程师所需的技术深度与跨团队交付能力。建议进入面试。",
  detailedOverall: {
    judgment:
      "**非常推荐。** React / TypeScript 技术栈、复杂系统设计及性能治理经历与资深前端岗位高度匹配，具备独立负责核心模块的能力。",
    matchingEvidence:
      "1. 字节跳动期间主导 6 个业务系统的微前端改造，完成公共组件和发布流程统一。\n2. 首屏加载从 3.2 秒降至 1.4 秒，减少 56% 等待时间。\n3. 在网易负责高流量业务页面和组件库，积累完整的工程化经验。",
    risks:
      "架构与性能能力有明确项目依据；正式面试重点核实灰度发布和故障回滚策略。跨团队协作经验明确，人员管理不是本岗位的核心要求。",
  },
  dimensions: {
    educationBackground: {
      basis: "general",
      evaluation: "浙江大学计算机科学本科，具备计算机基础和软件工程训练，专业背景与前端研发相符。",
      level: "recommended",
    },
    experienceRelevance: {
      basis: "job",
      evaluation:
        "8 年前端开发经验，在字节跳动与网易负责复杂业务系统；架构设计、工程治理与岗位职责直接相关。",
      level: "highly_recommended",
    },
    potential: {
      basis: "both",
      evaluation:
        "从业务交付发展到平台架构负责人，能将性能治理沉淀为团队标准，具备持续扩展技术影响力的能力。",
      level: "highly_recommended",
    },
    projectMatch: {
      basis: "job",
      evaluation:
        "主导 6 个系统的微前端迁移，覆盖模块拆分、灰度发布和共享依赖治理，符合复杂前端架构要求。",
      level: "highly_recommended",
    },
    skillMatch: {
      basis: "job",
      evaluation:
        "熟练使用 React、TypeScript 和微前端体系，结合代码分包与缓存策略将首屏加载降至 1.4 秒。",
      level: "highly_recommended",
    },
    stability: {
      basis: "general",
      evaluation:
        "两段工作经历均持续 4 年以上，参与长期系统演进，工作记录连贯，具有稳定的项目投入。",
      level: "recommended",
    },
  },
  recommendationLevel: "highly_recommended",
  schemaVersion: 2,
  seniorityRecommendation: {
    level: "高级前端工程师",
    rationale: "能够独立负责复杂业务模块，制定架构方案并带动跨团队工程治理。",
  },
  teamPositioning: {
    rationale: "适合负责前端平台演进、性能治理与关键业务交付，与产品和后端共同推进系统建设。",
    suggestion: "核心前端 / 技术骨干",
  },
};

export const demoConversation = [
  {
    answer:
      "我负责方案设计和迁移推进，将 6 个业务系统拆成独立应用，统一 React 组件库和 TypeScript 接口。每个应用支持独立发布，迁移分三批完成。",
    question: "请介绍你主导的微前端架构升级，以及你负责的具体部分。",
  },
  {
    answer:
      "共享依赖固定主版本，应用间使用显式接口通信。发布先经过 5% 灰度，监控错误率和关键链路；异常时通过配置中心切回上一版本，回滚在 2 分钟内完成。",
    question: "迁移过程中，你如何处理共享依赖和故障回滚？",
  },
  {
    answer:
      "先用真实用户监测定位瓶颈，再拆分路由代码、移除重复依赖，并调整缓存策略。使用同一网络分组比较 P75 指标，持续两周观察，首屏等待时间下降了 56%。",
    question: "首屏从 3.2 秒降到 1.4 秒，你如何确认优化有效？",
  },
] as const;

export const demoHumanEvaluation: HumanInterviewEvaluationDraft = {
  detailedAnalysis:
    "架构设计：明确区分应用边界与共享能力，迁移分批可回滚。\n性能优化：能解释 P75 采集口径，给出代码拆分、依赖治理与缓存的具体收益。\n协作交付：与 6 个业务团队统一接口规范，主导迁移评审和上线检查。",
  draftOutcome: "pass",
  evidenceTurnIds: ["demo-human-1", "demo-human-2"],
  overallEvaluation:
    "**建议通过技术复面。** 真嗣能够清晰解释架构决策、共享依赖治理和灰度回滚方案，对性能指标有可靠的采集与验证方法。与资深前端工程师岗位匹配。",
  professionalSkill: "优",
  rating: "A",
  risks: "直接带人经验较少，入职后以技术骨干职责为主；管理职责另行评估。",
  rolePosition: "核心前端技术骨干",
  salaryRecommendation: "月薪 ¥32,000–35,000，14 薪",
  seniorityPosition: "高级前端工程师",
  strengths: "架构拆分思路完整；能识别发布风险；性能分析以真实用户数据为依据；跨团队推进能力突出。",
};

export function createDemoHumanRound(completed: boolean): HumanInterviewRoundRecord {
  return {
    cancelReason: null,
    cancelledAt: null,
    completedAt: completed ? "2026-10-09T07:00:00.000Z" : null,
    createdAt: "2026-10-08T03:00:00.000Z",
    evaluation: completed ? demoHumanEvaluation : null,
    evaluationError: null,
    evaluationOverall: completed ? demoHumanEvaluation.overallEvaluation : null,
    evaluationRating: completed ? "A" : null,
    evaluationStatus: completed ? "submitted" : "not_started",
    evaluationSubmittedAt: completed ? "2026-10-09T07:10:00.000Z" : null,
    evaluationTranscriptRevisionId: null,
    evaluationUpdatedAt: null,
    evaluationUpdatedBy: null,
    feedback: null,
    format: "online",
    id: "demo-human-round",
    interviewRecordId: "01842",
    interviewers: [
      {
        confirmedAt: "2026-10-08T03:10:00.000Z",
        confirmedScheduleVersion: 1,
        declineReason: null,
        declinedAt: null,
        id: "demo-reviewer",
        image: null,
        name: "赤木律子",
        status: "confirmed",
      },
    ],
    label: "技术复面",
    location: null,
    meetingUrl: null,
    notes: "重点：架构设计、灰度回滚、性能指标验证。",
    organizationId: "demo",
    outcome: completed ? "pass" : null,
    reviewerEvaluations: completed
      ? [
          {
            evaluation: demoHumanEvaluation,
            id: "demo-review",
            legacy: false,
            outcome: "pass",
            reviewerId: "demo-reviewer",
            reviewerName: "赤木律子",
            submittedAt: "2026-10-09T07:10:00.000Z",
            updatedAt: "2026-10-09T07:10:00.000Z",
            version: 1,
          },
        ]
      : [],
    roundKind: "second_interview",
    scheduledAt: "2026-10-09T06:00:00.000Z",
    score: null,
    sortOrder: 1,
    status: completed ? "completed" : "pending",
    updatedAt: "2026-10-09T07:10:00.000Z",
  };
}

export const demoOffer: OfferDraftRecord = {
  baseSalary: 34_000,
  bonus: 68_000,
  candidateCounter: null,
  contentRevision: 1,
  createdAt: "2026-10-09T08:00:00.000Z",
  currency: "CNY",
  currentApprovalId: null,
  declineReason: null,
  emailRecipient: "shinji@example.com",
  emailSentAt: "2026-10-10T02:05:00.000Z",
  equity: "年度授予 1,000 股，4 年归属",
  expiresAt: "2026-10-16T15:59:59.000Z",
  id: "demo-offer",
  interviewRecordId: "01842",
  joiningDate: "2026-11-02",
  notes: "技术复面通过，薪资方案已完成沟通。试用期 3 个月，薪资按 100% 发放。",
  organizationId: "demo",
  position: "高级前端工程师",
  publicPath: null,
  publishedAt: "2026-10-10T02:00:00.000Z",
  publishedBy: "demo-hr",
  responseAt: null,
  responseBy: null,
  responseSource: null,
  sentAt: "2026-10-10T02:05:00.000Z",
  status: "sent",
  updatedAt: "2026-10-10T02:05:00.000Z",
  version: 1,
};

export function createDemoHumanMeeting(completed: boolean): HumanInterviewMeetingRecord {
  const startedAt = completed ? "2026-10-09T06:00:00.000Z" : null;
  const endedAt = completed ? "2026-10-09T07:00:00.000Z" : null;
  return {
    attendanceAlertedAt: null,
    cancelledAt: null,
    createdAt: "2026-10-08T03:00:00.000Z",
    createdBy: "demo-hr",
    endedAt,
    establishedAt: startedAt,
    feishu: null,
    id: "demo-human-meeting",
    interviewers: [
      {
        id: "demo-reviewer",
        image: null,
        joinedAt: startedAt,
        leftAt: endedAt,
        name: "赤木律子",
        role: "host",
      },
    ],
    lifecycleOccurredAt: endedAt,
    lifecycleSource: null,
    liveKitRoomName: null,
    notes: "真嗣 · 资深前端工程师技术复面",
    organizationId: "demo",
    processingMeetingSessionId: null,
    recordingDurationMs: completed ? 3_600_000 : null,
    recordingEgressId: null,
    recordingError: null,
    recordingFileKey: null,
    recordingSizeBytes: null,
    recordingStatus: "pending",
    rounds: [
      {
        candidateInviteExpiresAt: "2026-10-09T07:00:00.000Z",
        candidateInviteStatus: "accepted",
        candidateName: "真嗣",
        hasCandidateInvite: true,
        interviewRecordId: "01842",
        joinedAt: startedAt,
        label: "技术复面",
        leftAt: endedAt,
        roundId: "demo-human-round",
        sortOrder: 1,
        status: completed ? "completed" : "pending",
      },
    ],
    scheduleVersion: 1,
    scheduledAt: "2026-10-09T06:00:00.000Z",
    startedAt,
    status: completed ? "ended" : "scheduled",
    title: "真嗣 · 技术复面",
    updatedAt: "2026-10-09T07:10:00.000Z",
    validUntil: "2026-10-09T07:00:00.000Z",
  };
}

export const demoOfferNodes = (["income_proof", "salary_negotiation"] as const).map((node) => ({
  completedAt: "2026-10-10T01:00:00.000Z",
  decidedAt: "2026-10-10T01:00:00.000Z",
  decidedBy: "demo-hr",
  effectiveAiRoundId: null,
  effectiveHumanRoundId: "demo-human-round",
  effectiveOfferId: null,
  enteredAt: "2026-10-09T08:00:00.000Z",
  node,
  reason: "已完成沟通与材料核验",
  result: "pass" as const,
  status: "completed" as const,
}));
