import { lockAiRound } from "../studio/routes/interviews/dao/ai-round-lifecycle";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { buildCandidateFormAnswersSchema } from "@app/db-schema/candidate-forms";
import { recruitingFormSubmission } from "@app/db-schema/schema";
import { db } from "../../../lib/server/db/index";
import { factory, jsonValidatorError } from "../../factory";
import { loadCandidateInterviewRecord } from "./utils";
import { prepareQuestionBindings } from "./application/prepare-question-bindings";
import { loadActiveInterviewContextSnapshot } from "../studio/routes/interviews/dao/context-snapshots";
import { loadSubmittedTemplateIds } from "../studio/routes/forms/dao/submissions";

export const candidateFormsRouter = factory
  .createApp()
  .get("/:id/:roundId/forms", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    const payload = await db.transaction((tx) =>
      prepareQuestionBindings(tx, {
        interviewRecordId: id,
        phase: "forms",
        preview: true,
        roundId,
      }),
    );
    if (!payload) {
      return c.json({ error: "Interview not available." }, 404);
    }
    const required = payload.forms.map((form) => ({
      snapshot: form.snapshot,
      templateId: form.templateId,
      version: form.version,
      versionId: form.versionId,
    }));

    if (required.length === 0) {
      return c.json({ required: [], submitted: {} satisfies Record<string, true> }, 200);
    }

    const templateIds = required.map((form) => form.templateId);
    const submittedIds = await loadSubmittedTemplateIds(id, templateIds);

    const submitted: Record<string, true> = {};
    for (const templateId of submittedIds) {
      submitted[templateId] = true;
    }

    return c.json({ required, submitted }, 200);
  })
  .post("/:id/:roundId/forms/bind", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    const payload = await db.transaction((tx) =>
      prepareQuestionBindings(tx, {
        interviewRecordId: id,
        phase: "forms",
        preview: false,
        roundId,
      }),
    );
    if (!payload) {
      return c.json({ error: "Interview not available." }, 404);
    }
    const required = payload.forms.map((form) => ({
      snapshot: form.snapshot,
      templateId: form.templateId,
      version: form.version,
      versionId: form.versionId,
    }));

    if (required.length === 0) {
      return c.json({ required: [], submitted: {} satisfies Record<string, true> }, 200);
    }

    const templateIds = required.map((form) => form.templateId);
    const submittedIds = await loadSubmittedTemplateIds(id, templateIds);

    const submitted: Record<string, true> = {};
    for (const templateId of submittedIds) {
      submitted[templateId] = true;
    }

    return c.json({ required, submitted }, 200);
  })
  .post(
    "/:id/:roundId/forms/:templateId/submit",
    zValidator(
      "json",
      // 中文：answers 形状由 templateVersion 动态决定，这里只做粗校验。
      // English: answers shape is dynamic per templateVersion — only shallow check here.
      z.object({ answers: z.record(z.string(), z.unknown()), versionId: z.string().min(1) }),
      jsonValidatorError("请求参数缺失。"),
    ),
    async (c) => {
      const id = c.req.param("id");
      const roundId = c.req.param("roundId");
      const templateId = c.req.param("templateId");

      const interviewRecord = await loadCandidateInterviewRecord(id, roundId);
      if (!interviewRecord) {
        return c.json({ error: "Interview not available." }, 404);
      }
      if (interviewRecord.currentRoundStatus === "completed") {
        return c.json({ error: "当前面试轮次已结束，无法再提交面试表单。" }, 403);
      }

      const { versionId, answers: rawAnswers } = c.req.valid("json");

      return db.transaction(async (tx) => {
        const locked = await lockAiRound(tx, roundId);
        if (
          !locked?.isEffective ||
          locked.record.id !== id ||
          locked.round.status === "completed"
        ) {
          return c.json({ error: "当前面试轮次不可填写。" }, 409);
        }
        const contextSnapshot = await loadActiveInterviewContextSnapshot(id, tx);
        if (!contextSnapshot) {
          return c.json({ error: "Interview not available." }, 404);
        }
        const requiredForm = contextSnapshot.payload.forms.find(
          (form) => form.templateId === templateId,
        );
        if (!requiredForm) {
          return c.json({ error: "该面试表单不适用于当前面试。" }, 400);
        }
        if (
          contextSnapshot.payload.bindings?.forms === false ||
          requiredForm.versionId !== versionId
        ) {
          return c.json({ error: "面试表单版本已过期，请刷新页面后重试。" }, 409);
        }

        const answersSchema = buildCandidateFormAnswersSchema(requiredForm.snapshot);
        const parsed = answersSchema.safeParse(rawAnswers);
        if (!parsed.success) {
          return c.json({ error: parsed.error.issues[0]?.message ?? "面试表单填写不完整。" }, 400);
        }

        const now = new Date();
        const submissionId = crypto.randomUUID();
        try {
          await tx.insert(recruitingFormSubmission).values({
            answers: parsed.data,
            id: submissionId,
            organizationId: interviewRecord.organizationId,
            recruitingRecordId: id,
            submittedAt: now,
            templateId,
            versionId,
          });
        } catch {
          // Unique (templateId, interviewRecordId) — treat as already submitted.
          return c.json({ error: "该面试表单已提交过。" }, 409);
        }

        return c.json(
          { submissionId, success: true, version: requiredForm.version, versionId },
          200,
        );
      });
    },
  );
