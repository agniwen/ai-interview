/* oxlint-disable promise/prefer-await-to-callbacks -- Hono centralizes domain-error conversion in its callback error boundary. */
import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "../../../../factory";
import { getWorkspaceRequestContext } from "../../../../context/workspace-request-context";
import { requirePermission } from "../../../../middlewares/permission";
import {
  submitOfferApprovalSchema,
  offerApprovalDecisionSchema,
  offerApprovalWithdrawSchema,
  offerApprovalNotificationSchema,
  offerApprovalListSchema,
  offerApprovalTemplateInputSchema,
} from "@app/shared/offer-approval";
import { listApprovers, OfferApprovalError } from "./dao";
import {
  submitOfferApproval,
  decideOfferApproval,
  withdrawOfferApproval,
  notifyOfferApproval,
} from "./application/commands";
import { getOfferApproval, listOfferApprovals, previewOfferApproval } from "./application/queries";
import {
  createApprovalTemplate,
  deleteApprovalTemplate,
  listApprovalTemplates,
  listTemplateApprovers,
  setDefaultApprovalTemplate,
  updateApprovalTemplate,
} from "./application/templates";
import type { Context } from "hono";
import type { Env } from "../../../../type";

function actor(c: Context<Env>) {
  const context = getWorkspaceRequestContext(c);
  return { organizationId: context.organization.id, userId: context.user.id };
}
const defaultDependencies = {
  createApprovalTemplate,
  decideOfferApproval,
  deleteApprovalTemplate,
  getOfferApproval,
  listApprovalTemplates,
  listApprovers,
  listOfferApprovals,
  listTemplateApprovers,
  notifyOfferApproval,
  previewOfferApproval,
  setDefaultApprovalTemplate,
  submitOfferApproval,
  updateApprovalTemplate,
  withdrawOfferApproval,
};
export type OfferApprovalsRouteDependencies = typeof defaultDependencies & {
  requirePermission: typeof requirePermission;
  getActor: typeof actor;
};
const routeDependencies: OfferApprovalsRouteDependencies = {
  ...defaultDependencies,
  getActor: actor,
  requirePermission,
};
export function createOfferApprovalsRouter(
  dependencies: OfferApprovalsRouteDependencies = routeDependencies,
) {
  return factory
    .createApp()
    .onError((error, c) => {
      if (error instanceof OfferApprovalError) {
        return c.json({ error: error.message }, error.status);
      }
      throw error;
    })
    .use("*", dependencies.requirePermission("page", "offerApprovals"))
    .get("/approvers", dependencies.requirePermission("offerApproval", "create"), async (c) =>
      c.json(await dependencies.listApprovers(dependencies.getActor(c)), 200),
    )
    .get(
      "/preview/:offerId",
      dependencies.requirePermission("offerApproval", "create"),
      async (c) =>
        c.json(
          await dependencies.previewOfferApproval(dependencies.getActor(c), c.req.param("offerId")),
          200,
        ),
    )
    .get(
      "/",
      dependencies.requirePermission("offerApproval", "read"),
      zValidator("query", offerApprovalListSchema, jsonValidatorError("列表参数无效")),
      async (c) =>
        c.json(
          await dependencies.listOfferApprovals(dependencies.getActor(c), c.req.valid("query")),
          200,
        ),
    )
    .get("/templates", dependencies.requirePermission("offerApproval", "manage"), async (c) =>
      c.json(await dependencies.listApprovalTemplates(dependencies.getActor(c)), 200),
    )
    .get(
      "/template-approvers",
      dependencies.requirePermission("offerApproval", "manage"),
      async (c) => c.json(await dependencies.listTemplateApprovers(dependencies.getActor(c)), 200),
    )
    .post(
      "/templates",
      dependencies.requirePermission("offerApproval", "manage"),
      zValidator("json", offerApprovalTemplateInputSchema, jsonValidatorError("审批模板无效")),
      async (c) =>
        c.json(
          await dependencies.createApprovalTemplate(dependencies.getActor(c), c.req.valid("json")),
          201,
        ),
    )
    .put(
      "/templates/:templateId",
      dependencies.requirePermission("offerApproval", "manage"),
      zValidator("json", offerApprovalTemplateInputSchema, jsonValidatorError("审批模板无效")),
      async (c) =>
        c.json(
          await dependencies.updateApprovalTemplate(
            dependencies.getActor(c),
            c.req.param("templateId"),
            c.req.valid("json"),
          ),
          200,
        ),
    )
    .post(
      "/templates/:templateId/default",
      dependencies.requirePermission("offerApproval", "manage"),
      async (c) =>
        c.json(
          await dependencies.setDefaultApprovalTemplate(
            dependencies.getActor(c),
            c.req.param("templateId"),
          ),
          200,
        ),
    )
    .delete(
      "/templates/:templateId",
      dependencies.requirePermission("offerApproval", "manage"),
      async (c) =>
        c.json(
          await dependencies.deleteApprovalTemplate(
            dependencies.getActor(c),
            c.req.param("templateId"),
          ),
          200,
        ),
    )
    .post(
      "/",
      dependencies.requirePermission("offerApproval", "create"),
      zValidator("json", submitOfferApprovalSchema, jsonValidatorError("审批参数无效")),
      async (c) =>
        c.json(
          await dependencies.submitOfferApproval(dependencies.getActor(c), c.req.valid("json")),
          200,
        ),
    )
    .get("/:approvalId", dependencies.requirePermission("offerApproval", "read"), async (c) =>
      c.json(
        await dependencies.getOfferApproval(dependencies.getActor(c), c.req.param("approvalId")),
        200,
      ),
    )
    .post(
      "/:approvalId/steps/:stepId/decision",
      dependencies.requirePermission("offerApproval", "decide"),
      zValidator("json", offerApprovalDecisionSchema, jsonValidatorError("审批意见无效")),
      async (c) =>
        c.json(
          await dependencies.decideOfferApproval(
            dependencies.getActor(c),
            c.req.param("approvalId"),
            c.req.param("stepId"),
            c.req.valid("json"),
          ),
          200,
        ),
    )
    .post(
      "/:approvalId/withdraw",
      zValidator("json", offerApprovalWithdrawSchema, jsonValidatorError("撤回理由必填")),
      async (c) =>
        c.json(
          await dependencies.withdrawOfferApproval(
            dependencies.getActor(c),
            c.req.param("approvalId"),
            c.req.valid("json"),
          ),
          200,
        ),
    )
    .post(
      "/:approvalId/remind",
      zValidator("json", offerApprovalNotificationSchema, jsonValidatorError("通知参数无效")),
      async (c) =>
        c.json(
          await dependencies.notifyOfferApproval(
            dependencies.getActor(c),
            c.req.param("approvalId"),
            "remind",
            c.req.valid("json"),
          ),
          200,
        ),
    )
    .post(
      "/:approvalId/retry-notification",
      zValidator("json", offerApprovalNotificationSchema, jsonValidatorError("通知参数无效")),
      async (c) =>
        c.json(
          await dependencies.notifyOfferApproval(
            dependencies.getActor(c),
            c.req.param("approvalId"),
            "retry",
            c.req.valid("json"),
          ),
          200,
        ),
    );
}
export const offerApprovalsRouter = createOfferApprovalsRouter();
