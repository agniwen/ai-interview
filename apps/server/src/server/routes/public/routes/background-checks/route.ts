import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  globalConfig,
  jobDescription,
  organization,
  recruitingBackgroundCheck,
  recruitingEvent,
} from "@app/db-schema/schema";
import { backgroundCheckFormInputSchema } from "@app/db-schema/background-check";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../lib/server/db/index";
import { enqueueBackgroundCheckSubmittedEvent } from "../../../../interview-notifications/utils/events";
import { factory, jsonValidatorError } from "../../../../factory";
import { submitBackgroundCheck } from "../../../studio/routes/interviews/dao/background-check";

async function loadPublicBackgroundCheck(token: string) {
  const [row] = await db
    .select({
      candidateName: recruitingRecordReadModel.candidateName,
      companyName: sql<string>`coalesce(nullif(trim(${globalConfig.companyName}), ''), ${organization.name})`,
      jobName: sql<
        string | null
      >`coalesce(${jobDescription.name}, ${recruitingRecordReadModel.targetRole})`,
      organizationId: recruitingBackgroundCheck.organizationId,
      recruitingRecordId: recruitingBackgroundCheck.recruitingRecordId,
      status: recruitingBackgroundCheck.status,
    })
    .from(recruitingBackgroundCheck)
    .innerJoin(
      recruitingRecordReadModel,
      eq(recruitingRecordReadModel.id, recruitingBackgroundCheck.recruitingRecordId),
    )
    .innerJoin(organization, eq(organization.id, recruitingBackgroundCheck.organizationId))
    .leftJoin(
      globalConfig,
      eq(globalConfig.organizationId, recruitingBackgroundCheck.organizationId),
    )
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .where(eq(recruitingBackgroundCheck.publicToken, token))
    .limit(1);
  return row ?? null;
}

export const publicBackgroundChecksRouter = factory
  .createApp()
  .get("/:token", async (c) => {
    const record = await loadPublicBackgroundCheck(c.req.param("token"));
    if (!record) {
      return c.json({ error: "当前背调链接不可用。" }, 404);
    }
    await db.insert(recruitingEvent).values({
      action: "background_check_link_accessed",
      createdAt: new Date(),
      detail: {},
      id: crypto.randomUUID(),
      operatorId: null,
      organizationId: record.organizationId,
      recruitingRecordId: record.recruitingRecordId,
    });
    return c.json(
      {
        candidateName: record.candidateName,
        companyName: record.companyName,
        jobName: record.jobName,
        status: record.status,
      },
      200,
    );
  })
  .post(
    "/:token/submit",
    zValidator(
      "json",
      backgroundCheckFormInputSchema,
      jsonValidatorError("背调信息填写不完整，请检查后重试。"),
    ),
    async (c) => {
      const result = await submitBackgroundCheck(
        c.req.param("token"),
        c.req.valid("json"),
        async ({ organizationId, recruitingRecordId, submittedAt, tx }) => {
          await tx.insert(recruitingEvent).values({
            action: "background_check_submitted_by_candidate",
            createdAt: submittedAt,
            detail: {},
            id: crypto.randomUUID(),
            operatorId: null,
            organizationId,
            recruitingRecordId,
          });
          await enqueueBackgroundCheckSubmittedEvent(tx, {
            recruitingRecordId,
            submittedAt,
          });
        },
      );
      if (result === "unavailable") {
        return c.json({ error: "当前背调链接已提交或不可用。" }, 409);
      }
      return c.json({ status: result }, 200);
    },
  );
