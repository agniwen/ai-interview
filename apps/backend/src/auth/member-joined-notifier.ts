import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { account, organization, user } from "@arc/db-schema/schema";
import type { Database } from "../infrastructure/database/database.tokens.js";
import { getFeishuTenantAccessToken } from "./feishu-oauth.js";

const FEISHU_PROVIDER_IDS = ["feishu", "feishu-jiguang-hr"] as const;
type FeishuProviderId = (typeof FEISHU_PROVIDER_IDS)[number];

const messageResponseSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
});

export interface MemberJoinedNotificationInput {
  creatorUserId: string | null;
  joinedUserId: string;
  organizationId: string;
}

export interface AuthMemberJoinedNotifier {
  notify(input: MemberJoinedNotificationInput): Promise<"sent" | "skipped">;
}

function isFeishuProviderId(value: string): value is FeishuProviderId {
  return FEISHU_PROVIDER_IDS.some((providerId) => providerId === value);
}

function providerCredentials(
  providerId: FeishuProviderId,
): { appId: string; appSecret: string } | null {
  const suffix = providerId === "feishu" ? "" : "2";
  const appId = process.env[`FEISHU_APP_ID${suffix}`];
  const appSecret = process.env[`FEISHU_APP_SECRET${suffix}`];
  return appId && appSecret ? { appId, appSecret } : null;
}

function membersUrl(slug: string): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  return baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/w/${encodeURIComponent(slug)}/studio/members`
    : null;
}

function memberJoinedCard(input: {
  joinedMemberName: string;
  membersUrl: string | null;
  workspaceName: string;
}) {
  interface Text {
    content: string;
    tag: "lark_md" | "plain_text";
  }
  type Element =
    | { fields: { is_short: boolean; text: Text }[]; tag: "div" }
    | { tag: "div"; text: Text }
    | { tag: "hr" }
    | {
        actions: { tag: "button"; text: Text; type: "primary"; url: string }[];
        tag: "action";
      };
  const elements: Element[] = [
    {
      fields: [
        {
          is_short: true,
          text: { content: `**成员**\n${input.joinedMemberName}`, tag: "lark_md" },
        },
        { is_short: true, text: { content: `**工作区**\n${input.workspaceName}`, tag: "lark_md" } },
      ],
      tag: "div",
    },
    { tag: "hr" },
    {
      tag: "div",
      text: {
        content: "该成员已完成飞书登录并加入工作区。请回到真人复面安排，刷新面试官列表后进行选择。",
        tag: "plain_text",
      },
    },
  ];
  if (input.membersUrl) {
    elements.push(
      { tag: "hr" },
      {
        actions: [
          {
            tag: "button",
            text: { content: "查看工作区成员", tag: "plain_text" },
            type: "primary",
            url: input.membersUrl,
          },
        ],
        tag: "action",
      },
    );
  }
  return {
    elements,
    header: {
      template: "green",
      title: { content: "✅ 邀请成员已加入工作区", tag: "plain_text" },
    },
  };
}

export class FeishuMemberJoinedNotifier implements AuthMemberJoinedNotifier {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async notify(input: MemberJoinedNotificationInput): Promise<"sent" | "skipped"> {
    if (!input.creatorUserId || input.creatorUserId === input.joinedUserId) {
      return "skipped";
    }
    const [creatorAccount] = await this.database
      .select({ openId: account.accountId, providerId: account.providerId })
      .from(account)
      .where(
        and(
          eq(account.userId, input.creatorUserId),
          inArray(account.providerId, [...FEISHU_PROVIDER_IDS]),
        ),
      )
      .orderBy(desc(account.updatedAt))
      .limit(1);
    if (!(creatorAccount && isFeishuProviderId(creatorAccount.providerId))) {
      return "skipped";
    }
    const credentials = providerCredentials(creatorAccount.providerId);
    if (!credentials) {
      return "skipped";
    }
    const [[joinedMember], [workspace]] = await Promise.all([
      this.database
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, input.joinedUserId))
        .limit(1),
      this.database
        .select({ name: organization.name, slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1),
    ]);
    if (!(joinedMember && workspace)) {
      return "skipped";
    }
    const tenantToken = await getFeishuTenantAccessToken(credentials.appId, credentials.appSecret);
    const response = await fetch(
      "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
      {
        body: JSON.stringify({
          content: JSON.stringify(
            memberJoinedCard({
              joinedMemberName: joinedMember.name,
              membersUrl: membersUrl(workspace.slug),
              workspaceName: workspace.name,
            }),
          ),
          msg_type: "interactive",
          receive_id: creatorAccount.openId,
        }),
        headers: {
          authorization: `Bearer ${tenantToken}`,
          "content-type": "application/json; charset=utf-8",
        },
        method: "POST",
      },
    );
    const result = messageResponseSchema.parse(await response.json());
    if (!response.ok || result.code !== 0) {
      throw new Error(
        `Feishu member-joined notification failed: ${result.code} ${result.msg ?? ""}`,
      );
    }
    return "sent";
  }
}
