/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- The notification adapter checks the selected member row before projecting its stable persisted shape. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import { Inject, Injectable } from "@nestjs/common";
import * as lark from "@larksuiteoapi/node-sdk";
import { and, desc, eq, inArray } from "drizzle-orm";
import { account, organization, user } from "@arc/db-schema/schema";
import { HTTP_DATABASE } from "../../../infrastructure/http/http.ports.js";
import type { HttpDatabase } from "../../../infrastructure/http/http.ports.js";
import type { JoinNotificationPort } from "./join.port.js";

const PROVIDERS = ["feishu", "feishu-jiguang-hr"] as const;

@Injectable()
export class JoinNotificationService implements JoinNotificationPort {
  constructor(
    @Inject(HTTP_DATABASE)
    private readonly database: HttpDatabase,
  ) {}

  async notifyInviteCreatorMemberJoined(input: {
    creatorUserId: string | null;
    joinedUserId: string;
    organizationId: string;
  }) {
    if (!input.creatorUserId || input.creatorUserId === input.joinedUserId) {
      return;
    }
    const [[creator], [joined], [workspace]] = await Promise.all([
      this.database
        .select({ openId: account.accountId, providerId: account.providerId })
        .from(account)
        .where(
          and(eq(account.userId, input.creatorUserId), inArray(account.providerId, [...PROVIDERS])),
        )
        .orderBy(desc(account.updatedAt))
        .limit(1),
      this.database
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, input.joinedUserId))
        .limit(1),
      this.database
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1),
    ]);
    if (!(creator && joined && workspace) || !PROVIDERS.includes(creator.providerId as never)) {
      return;
    }
    const secondary = creator.providerId === "feishu-jiguang-hr";
    const appId = rawBackendEnvironment[secondary ? "FEISHU_APP_ID2" : "FEISHU_APP_ID"]?.trim();
    const appSecret =
      rawBackendEnvironment[secondary ? "FEISHU_APP_SECRET2" : "FEISHU_APP_SECRET"]?.trim();
    if (!(appId && appSecret)) {
      return;
    }
    const client = new lark.Client({ appId, appSecret });
    await client.im.message.create({
      data: {
        content: JSON.stringify({
          text: `${joined.name} 已加入工作区「${workspace.name}」。请刷新面试官列表后进行选择。`,
        }),
        msg_type: "text",
        receive_id: creator.openId,
      },
      params: { receive_id_type: "open_id" },
    });
  }
}
