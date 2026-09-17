/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof -- 输入为历史表的原始 JSON，当前 schema 无法验证旧 artifact；此处仅验证迁移身份和确切节点，保留历史值。 */
import { recruitingNodeValues } from "@app/db-schema";
import type { RecruitingNode } from "@app/db-schema";
import { QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION } from "@app/db-schema/qualitative-resume-evaluation";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  required,
  digest,
  key,
  object,
  pick,
  requiredString,
  sqlName,
  stableId,
  table,
  tableCopies,
} from "./model";
import type { CopyItem, MigrationMapping, MigrationPlan, Row } from "./model";

export type SourceData = Map<string, Row[]>;
function latest(rows: Row[], order = "created_at"): Row | undefined {
  return rows.toSorted((a, b) => {
    const primary =
      typeof a[order] === "number" && typeof b[order] === "number"
        ? Number(b[order]) - Number(a[order])
        : String(b[order] ?? "").localeCompare(String(a[order] ?? ""));
    return (
      primary ||
      Number(b.sort_order ?? 0) - Number(a.sort_order ?? 0) ||
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")) ||
      String(b.id).localeCompare(String(a.id))
    );
  })[0];
}
function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  // 原 Offer 入职日期按产品使用的中国时区取日；纯日期不作 UTC 转换。
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError("Invalid historical joining date");
  }
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(instant);
}
function contract(mode: string, artifact: unknown): string {
  const data = object(artifact);
  if (mode === "qualitative") {
    return data.schemaVersion ? `qualitative-v${data.schemaVersion}` : "qualitative-unknown";
  }
  if (mode === "structured") {
    const engine = object(data.engine);
    return data.schemaVersion && engine.engineVersion && engine.promptVersion
      ? `structured-v${data.schemaVersion}:engine=${engine.engineVersion}:prompt=${engine.promptVersion}`
      : "structured-unknown";
  }
  return data.schemaVersion ? `legacy-resume-review-v${data.schemaVersion}` : "legacy-unknown";
}

function closedReason(source: Row, meta: Row, node: RecruitingNode): string {
  if (source.outcome === "hired") {
    return "onboarded";
  }
  if (source.outcome === "withdrawn") {
    return "candidate_withdrew";
  }
  if (meta.category === "comp_disagreement") {
    return "salary_disagreement";
  }
  if (meta.category === "position_filled") {
    return "position_closed";
  }
  if (source.outcome === "rejected" && node === "screening") {
    return "resume_rejected";
  }
  if (source.outcome === "rejected" && node.includes("interview")) {
    return "interview_failed";
  }
  return "other";
}
function currentArtifactMode(source: Row): string {
  if (source.resume_evaluation_artifact_mode) {
    return String(source.resume_evaluation_artifact_mode);
  }
  if (source.qualitative_resume_evaluation) {
    return "qualitative";
  }
  if (source.structured_resume_evaluation) {
    return "structured";
  }
  return "legacy";
}
function interviewStatus(round: Row, decided = false): string {
  if (decided) {
    return "completed";
  }
  if (round.status === "completed") {
    return "awaiting_review";
  }
  if (round.status === "in_progress" || round.status === "interrupted") {
    return "in_progress";
  }
  return round.scheduled_at ? "scheduled" : "pending";
}
function offerProgress(offer: Row): Row {
  if (offer.status === "accepted") {
    return { result: "pass", status: "completed" };
  }
  if (offer.status === "declined") {
    return { result: "fail", status: "completed" };
  }
  return { result: null, status: offer.status === "sent" ? "awaiting_response" : "negotiating" };
}
function initialNodeStatus(beforeCurrent: boolean, current: boolean): string {
  if (beforeCurrent) {
    return "skipped";
  }
  return current ? "pending" : "inactive";
}
const resumeId = (id: Row[string]) => stableId("resume", id);

/** 只构造目标数据；没有数据库副作用，也不发送邀请或触发评估。 */
// oxlint-disable-next-line complexity -- 一次性迁移需逐字段列出旧主表各领域映射；分支对应不同历史契约，不参与运行时业务。
export function buildMigrationPlan(
  data: SourceData,
  mapping: MigrationMapping = {},
): MigrationPlan {
  const plan: MigrationPlan = { decisions: [], items: [], warnings: [] };
  const rows = (name: string) => data.get(name) ?? [];
  const add = (sourceName: string, source: Row, targetName: string, row: Row, suffix = "") => {
    plan.items.push({
      row,
      source,
      sourceKey: key(sourceName, source) + suffix,
      sourceName,
      targetName,
    });
  };
  const records = new Map(rows("studioInterview").map((r) => [r.id, r]));
  const roundKinds = new Map<unknown, "second_interview" | "final_interview">();
  for (const round of rows("studioHumanInterviewRound")) {
    const id = requiredString(round.id);
    let kind = mapping.humanRoundKinds?.[id];
    let reason = "显式迁移映射";
    if (!kind && /终面|终试/.test(String(round.label))) {
      kind = "final_interview";
      reason = "名称明确标记终面/终试";
    }
    if (!kind && /复面|复试/.test(String(round.label))) {
      kind = "second_interview";
      reason = "名称明确标记复面/复试";
    }
    if (!kind && mapping.inferLegacyNodes) {
      const record = records.get(round.interview_record_id);
      const afterInterview =
        record?.pipeline_stage === "offer" || object(record?.closed_meta).previousStage === "offer";
      kind =
        /CEO|总裁|董事长/i.test(String(round.label)) && afterInterview
          ? "final_interview"
          : "second_interview";
      reason =
        kind === "final_interview"
          ? "高层面试且流程已经进入 Offer，归终面，原评价不变"
          : "缺少终面依据，保守归复试，原名称与评价保留";
    }
    if (!kind) {
      throw new Error(
        `Unmapped human round ${id}; supply humanRoundKinds or authorized --infer-legacy-nodes`,
      );
    }
    roundKinds.set(round.id, kind);
    plan.decisions.push({
      decision: kind,
      reason,
      sourceKey: id,
      sourceTable: "studio_human_interview_round",
    });
  }
  const resolveNode = (record: Row, stage: unknown): RecruitingNode => {
    const mapped = mapping.recordNodes?.[requiredString(record.id)];
    if (mapped) {
      return mapped;
    }
    // SAFETY: includes 校验后只返回 schema 声明过的具体节点。
    if (recruitingNodeValues.includes(stage as RecruitingNode)) {
      // SAFETY: stage 已由上方 includes 校验为确切的 RecruitingNode 成员。
      return stage as RecruitingNode;
    }
    if (stage === "human_interview") {
      const round = latest(
        rows("studioHumanInterviewRound").filter(
          (r) => r.interview_record_id === record.id && r.status !== "cancelled",
        ),
        "scheduled_at",
      );
      return roundKinds.get(round?.id) ?? "second_interview";
    }
    if (
      mapping.inferLegacyNodes &&
      (stage === "written_test" || stage === null || stage === undefined)
    ) {
      plan.decisions.push({
        decision: "screening",
        reason: "旧阶段没有对应新节点，保留原始值并回到待筛选",
        sourceKey: requiredString(record.id),
        sourceTable: "studio_interview",
      });
      return "screening";
    }
    throw new Error(`Unmapped stage on recruiting record ${record.id}: ${String(stage)}`);
  };

  const evaluationItems: CopyItem[] = [];
  for (const sourceName of ["resumeEvaluationVersion", "resumeEvaluationFailure"]) {
    for (const source of rows(sourceName)) {
      const success = sourceName === "resumeEvaluationVersion";
      const row = {
        ...pick(source, [
          "id",
          "artifact",
          "contract_version",
          "created_at",
          "job_description_version_id",
          "numeric_score",
          "organization_id",
          "recommendation_level",
          "run_id",
          "error_message",
        ]),
        completed_at: source.created_at,
        kind: "resume_review",
        recruiting_record_id: source.resume_record_id,
        resume_id: resumeId(source.resume_record_id),
        status: success ? "succeeded" : "failed",
      };
      const item = {
        row,
        source,
        sourceKey: key(sourceName, source),
        sourceName,
        targetName: "recruitingResumeEvaluation",
      };
      evaluationItems.push(item);
      plan.items.push(item);
    }
  }
  for (const source of rows("studioInterview")) {
    const id = requiredString(source.id);
    const common = pick(source, ["organization_id", "created_at", "created_by", "updated_at"]);
    const candidateId = stableId("candidate", id);
    add("studioInterview", source, "candidate", {
      ...common,
      email: source.candidate_email,
      id: candidateId,
      name: source.candidate_name,
      phone: source.candidate_phone,
    });
    const resumeFields = [
      "content_hash",
      "file_name",
      "parse_error",
      "parse_status",
      "parsed_at",
      "profile",
      "storage_key",
      "text",
    ];
    add("studioInterview", source, "candidateResume", {
      ...common,
      ...Object.fromEntries(
        resumeFields.map((field) => [field, source[`resume_${field}`] ?? null]),
      ),
      ...pick(source, ["search_text", "search_cjk_bigrams", "skills_normalized"]),
      candidate_id: candidateId,
      id: resumeId(id),
      version: 1,
    });
    const ended = source.pipeline_stage === "closed";
    const meta = object(source.closed_meta);
    const node = resolveNode(source, ended ? meta.previousStage : source.pipeline_stage);
    if (ended && !source.closed_at) {
      throw new Error(`Closed record ${id} has no closed_at`);
    }
    const reason = closedReason(source, meta, node);
    const closedNode = source.outcome === "hired" ? "onboarding" : node;
    const record: Row = {
      ...common,
      ...pick(source, [
        "id",
        "job_description_id",
        "target_role",
        "notes",
        "outcome",
        "hr_resume_assessment",
        "hr_resume_assessment_updated_at",
        "hr_resume_assessment_updated_by",
      ]),
      active_evaluation_id: null,
      candidate_id: candidateId,
      current_evaluation_id: null,
      current_stage: ended ? "closed" : node,
      resume_id: resumeId(id),
      stage_entered_at: null,
      version: 0,
      ...Object.fromEntries(
        ["type", "pool_item_id", "imported_at", "imported_by"].map((field) => [
          `source_${field}`,
          source[`resume_source_${field}`] ?? null,
        ]),
      ),
      close_details: ended ? { ...meta, legacyClosedReason: source.closed_reason } : null,
      close_reason: ended ? reason : null,
      closed_at: ended ? source.closed_at : null,
      closed_from_node: ended ? closedNode : null,
    };
    const candidates = evaluationItems.filter((item) => item.row.recruiting_record_id === id);
    const mode = currentArtifactMode(source);
    for (const [artifactMode, field] of [
      ["legacy", "resume_review"],
      ["structured", "structured_resume_evaluation"],
      ["qualitative", "qualitative_resume_evaluation"],
    ] as const) {
      const artifact = source[field];
      if (artifact === null || artifact === undefined) {
        continue;
      }
      const contractVersion = contract(artifactMode, artifact);
      let match = latest(
        candidates
          .filter(
            (item) =>
              item.row.status === "succeeded" &&
              item.row.contract_version === contractVersion &&
              digest(item.row.artifact) === digest(artifact),
          )
          .map((item) => item.row),
      );
      if (!match) {
        match = {
          artifact,
          completed_at: source.resume_review_generated_at,
          contract_version: contractVersion,
          created_at: source.resume_review_generated_at ?? source.created_at,
          id: stableId(`evaluation_${artifactMode}`, id),
          job_description_version_id:
            artifactMode === "qualitative" ? source.qualitative_job_description_version_id : null,
          kind: "resume_review",
          numeric_score: artifactMode === "structured" ? source.structured_composite_score : null,
          organization_id: source.organization_id,
          recommendation_level:
            artifactMode === "qualitative" ? source.qualitative_recommendation_level : null,
          recruiting_record_id: id,
          resume_id: resumeId(id),
          run_id: `migration:current:${artifactMode}`,
          status: "succeeded",
        };
        add(
          "studioInterview",
          source,
          "recruitingResumeEvaluation",
          match,
          `:artifact:${artifactMode}`,
        );
      }
      if (artifactMode === mode) {
        record.current_evaluation_id = match.id;
      }
    }
    const reviewStatus = source.resume_review_status;
    if (["queued", "processing", "failed"].includes(String(reviewStatus))) {
      const attemptMode = String(source.resume_evaluation_attempt_mode ?? mode);
      const version =
        attemptMode === "qualitative"
          ? QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION
          : `${attemptMode}-unknown`;
      const prior = candidates.find(
        (item) =>
          item.row.status === "failed" &&
          item.row.run_id === source.resume_review_run_id &&
          item.row.contract_version === version,
      );
      if (prior && reviewStatus === "failed") {
        record.active_evaluation_id = prior.row.id;
      } else {
        const activeId = stableId("evaluation_attempt", id);
        add(
          "studioInterview",
          source,
          "recruitingResumeEvaluation",
          {
            artifact: null,
            completed_at: null,
            contract_version: version,
            created_at: source.resume_review_queued_at ?? source.created_at,
            error_message:
              reviewStatus === "failed"
                ? (source.resume_review_error ?? "旧数据未记录失败原因")
                : null,
            id: activeId,
            job_description_version_id: source.qualitative_attempt_job_description_version_id,
            kind: "resume_review",
            organization_id: source.organization_id,
            recruiting_record_id: id,
            resume_id: resumeId(id),
            run_id: source.resume_review_run_id,
            started_at: source.resume_review_queued_at,
            status: reviewStatus,
          },
          ":attempt",
        );
        record.active_evaluation_id = activeId;
      }
      if (reviewStatus !== "failed") {
        plan.warnings.push(`Pending evaluation preserved: ${id}`);
      }
    }
    for (const screeningStatus of [
      source.resume_screening_result === null || source.resume_screening_result === undefined
        ? null
        : "succeeded",
      ["queued", "processing", "failed"].includes(String(source.resume_screening_status))
        ? source.resume_screening_status
        : null,
    ]) {
      if (!screeningStatus) {
        continue;
      }
      const succeeded = screeningStatus === "succeeded";
      add(
        "studioInterview",
        source,
        "recruitingResumeEvaluation",
        {
          artifact: succeeded ? source.resume_screening_result : null,
          completed_at: succeeded ? source.resume_screening_evaluated_at : null,
          contract_version: "legacy-screening",
          created_at: source.resume_screening_evaluated_at ?? source.created_at,
          error_message:
            screeningStatus === "failed"
              ? (source.resume_screening_error ?? "旧数据未记录失败原因")
              : null,
          id: stableId(succeeded ? "screening" : "screening_attempt", id),
          kind: "resume_screening",
          organization_id: source.organization_id,
          recruiting_record_id: id,
          resume_id: resumeId(id),
          run_id: succeeded ? "migration:screening" : "migration:screening-attempt",
          status: screeningStatus,
        },
        succeeded ? ":screening" : ":screening-attempt",
      );
    }
    add("studioInterview", source, "recruitingRecord", record);
    add("studioInterview", source, "recruitingInterviewPreparation", {
      organization_id: source.organization_id,
      questions: source.interview_questions,
      recruiting_record_id: id,
      updated_at: source.updated_at,
    });
    const offer = latest(
      rows("studioOfferDraft").filter(
        (r) => r.interview_record_id === id && r.status !== "superseded",
      ),
    );
    const hired = object(meta.hiredDetails);
    add("studioInterview", source, "recruitingFulfillment", {
      ...pick(common, ["organization_id", "created_at", "updated_at"]),
      actual_joining_date: dateOnly(hired.actualJoiningDate),
      candidate_expectations: source.candidate_expectations_meta,
      expected_joining_date: dateOnly(offer?.joining_date),
      onboarding_confirmed_at: source.outcome === "hired" ? source.closed_at : null,
      onboarding_contact: hired.onboardingContact ?? null,
      recruiting_record_id: id,
      selected_offer_id: offer?.id ?? null,
    });
    for (const targetNode of recruitingNodeValues) {
      const beforeCurrent =
        recruitingNodeValues.indexOf(targetNode) < recruitingNodeValues.indexOf(node);
      const state: Row = {
        node: targetNode,
        organization_id: source.organization_id,
        reason: beforeCurrent ? "历史没有有效通过依据，迁移为跳过；详见迁移事件" : null,
        recruiting_record_id: id,
        result: null,
        status: initialNodeStatus(beforeCurrent, targetNode === node),
        updated_at: source.updated_at,
      };
      if (
        targetNode === "screening" &&
        ["pass", "fail"].includes(String(source.resume_evaluation_status))
      ) {
        Object.assign(state, {
          decided_at: source.hr_resume_assessment_updated_at,
          decided_by: source.hr_resume_assessment_updated_by,
          result: source.resume_evaluation_status,
          status: "completed",
        });
      }
      if (targetNode === "ai_interview" && targetNode === node) {
        const round = latest(
          rows("studioInterviewSchedule").filter((r) => r.interview_record_id === id),
          "sort_order",
        );
        if (round) {
          Object.assign(state, {
            effective_ai_round_id: round.id,
            status: interviewStatus(round),
          });
        }
      }
      if (
        (targetNode === "second_interview" || targetNode === "final_interview") &&
        (beforeCurrent || targetNode === node)
      ) {
        const round = latest(
          rows("studioHumanInterviewRound").filter(
            (r) =>
              r.interview_record_id === id &&
              roundKinds.get(r.id) === targetNode &&
              r.status !== "cancelled",
          ),
          "scheduled_at",
        );
        if (round) {
          const decided =
            round.status === "completed" && (round.outcome === "pass" || round.outcome === "fail");
          if (decided || targetNode === node) {
            Object.assign(state, {
              completed_at: decided ? round.completed_at : null,
              effective_human_round_id: round.id,
              result: decided ? round.outcome : null,
              status: interviewStatus(round, decided),
            });
          }
        }
      }
      if (targetNode === "offer" && offer && (beforeCurrent || targetNode === node)) {
        Object.assign(state, {
          effective_offer_id: offer.id,
          ...offerProgress(offer),
        });
      }
      if (ended && source.outcome === "hired" && targetNode === "onboarding") {
        Object.assign(state, {
          completed_at: source.closed_at,
          reason: "旧招聘最终结论明确为录用",
          result: "pass",
          status: "completed",
        });
      }
      if (
        ended &&
        targetNode === node &&
        ["rejected", "withdrawn"].includes(String(source.outcome))
      ) {
        Object.assign(state, {
          completed_at: source.closed_at,
          result: source.outcome === "rejected" ? "fail" : "withdrawn",
          status: "completed",
        });
      }
      add("studioInterview", source, "recruitingNodeState", state, `:node:${targetNode}`);
    }
    add("studioInterview", source, "recruitingEvent", {
      action: "migration.source_copied",
      created_at: source.updated_at,
      detail: {
        humanRoundMappings: plan.decisions.filter((d) =>
          rows("studioHumanInterviewRound").some(
            (r) => r.id === d.sourceKey && r.interview_record_id === id,
          ),
        ),
        legacySource: source,
        nodeMapping: node,
      },
      from_outcome: source.outcome,
      from_stage: record.current_stage,
      id: stableId("source_snapshot", id),
      organization_id: source.organization_id,
      recruiting_record_id: id,
      to_outcome: source.outcome,
      to_stage: record.current_stage,
    });
  }
  const rowById = (name: string, id: unknown) => rows(name).find((r) => r.id === id);
  type OrganizationParentMap = Record<string, [string, string]>;
  const addedOrgParents: OrganizationParentMap = {
    mailIngestMessage: ["mailIngestAccount", "account_id"],
    resumeJobMatchCandidate: ["resumeJobMatchRun", "run_id"],
    studioHumanInterviewMeetingEvent: ["studioHumanInterviewMeeting", "meeting_id"],
    studioHumanInterviewMeetingInterviewer: ["studioHumanInterviewMeeting", "meeting_id"],
    studioHumanInterviewMeetingRound: ["studioHumanInterviewMeeting", "meeting_id"],
    studioHumanInterviewRoundInterviewer: ["studioHumanInterviewRound", "round_id"],
  };
  for (const [sourceName, targetName] of Object.entries(tableCopies)) {
    for (const source of rows(sourceName)) {
      const row = pick(
        source,
        getTableConfig(table(targetName)).columns.map((c) => c.name),
      );
      for (const field of [
        "interview_record_id",
        "resume_record_id",
        "imported_resume_record_id",
      ]) {
        if (field in source) {
          row.recruiting_record_id = source[field];
        }
      }
      if ("schedule_entry_id" in source) {
        row.ai_round_id = source.schedule_entry_id;
      }
      if (sourceName === "interviewConversation" && !row.ai_round_id) {
        const pointers = rows("studioInterviewSchedule").filter(
          (round) =>
            round.conversation_id === source.conversation_id &&
            round.organization_id === source.organization_id &&
            (source.interview_record_id === null ||
              source.interview_record_id === round.interview_record_id),
        );
        if (pointers.length > 1) {
          throw new Error(`Ambiguous reverse AI round pointer: ${source.conversation_id}`);
        }
        const [inferred] = pointers;
        if (inferred) {
          row.ai_round_id = inferred.id;
          plan.decisions.push({
            decision: String(inferred.id),
            reason: "旧会话缺少轮次 ID，按同招聘同工作区的唯一当前会话反向引用补齐新表关联",
            sourceKey: key(sourceName, source),
            sourceTable: "interview_conversation",
          });
        }
      }

      if (sourceName in addedOrgParents) {
        const [parent, field] = required(addedOrgParents[sourceName]);
        row.organization_id = rowById(parent, source[field])?.organization_id;
        if (!row.organization_id) {
          throw new Error(`Missing organization for ${sourceName} ${key(sourceName, source)}`);
        }
      }
      if (sourceName === "studioHumanInterviewRound") {
        row.round_kind = roundKinds.get(source.id);
      }
      for (const field of ["source_type", "matched_source_type"]) {
        if (row[field] === "studio_interview") {
          row[field] = "recruiting_record";
        }
      }
      add(sourceName, source, targetName, row);
    }
  }
  // 每条目标身份只能有一个来源。发现冲突必须处理源语义，不能 ON CONFLICT 静默跳过。
  const identities = new Set<string>();
  for (const item of plan.items) {
    const identity = `${sqlName(item.targetName)}:${key(item.targetName, item.row)}`;
    if (identities.has(identity)) {
      throw new Error(`Duplicate migration identity: ${identity}`);
    }
    identities.add(identity);
  }
  return plan;
}
