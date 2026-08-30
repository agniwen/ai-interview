/* oxlint-disable jsdoc/check-tag-names -- `@jsxImportSource` is a TS compiler directive */
/** @jsxImportSource chat */
import { and, desc, eq, inArray } from "drizzle-orm";
import { Actions, Card, CardText, Divider, Field, Fields, LinkButton, Section } from "chat";
import { db } from "@app/server/lib/server/db";
import { FEISHU_PROVIDER_IDS } from "@app/server/server/routes/feishu/utils/provider";
import type { FeishuProviderId } from "@app/server/server/routes/feishu/utils/provider";
import { account, organization, user } from "@arc/db-schema/schema";

export interface WorkspaceMemberJoinedNotificationContext {
  joinedMemberName: string;
  membersUrl: string | null;
  openId: string;
  providerId: FeishuProviderId;
  workspaceName: string;
}

export function WorkspaceMemberJoinedCard({
  joinedMemberName,
  membersUrl,
  workspaceName,
}: Omit<WorkspaceMemberJoinedNotificationContext, "openId" | "providerId">) {
  return (
    <Card title="✅ 邀请成员已加入工作区">
      <Section>
        <Fields>
          <Field label="成员" value={joinedMemberName} />
          <Field label="工作区" value={workspaceName} />
        </Fields>
      </Section>
      <Divider />
      <Section>
        <CardText>
          该成员已完成飞书登录并加入工作区。请回到真人复面安排，刷新面试官列表后进行选择。
        </CardText>
      </Section>
      {membersUrl ? <Divider /> : null}
      {membersUrl ? (
        <Actions>
          <LinkButton style="primary" url={membersUrl}>
            查看工作区成员
          </LinkButton>
        </Actions>
      ) : null}
    </Card>
  );
}

function resolveMembersUrl(slug: string): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl.replace(/\/$/, "")}/w/${encodeURIComponent(slug)}/studio/members`;
}

function isFeishuProviderId(value: string): value is FeishuProviderId {
  return FEISHU_PROVIDER_IDS.some((providerId) => providerId === value);
}

async function loadNotificationContext(input: {
  creatorUserId: string;
  joinedUserId: string;
  organizationId: string;
}): Promise<WorkspaceMemberJoinedNotificationContext | null> {
  const [creatorAccount] = await db
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
    return null;
  }
  const [[joinedMember], [workspace]] = await Promise.all([
    db.select({ name: user.name }).from(user).where(eq(user.id, input.joinedUserId)).limit(1),
    db
      .select({ name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .limit(1),
  ]);
  if (!(joinedMember && workspace)) {
    return null;
  }
  return {
    joinedMemberName: joinedMember.name,
    membersUrl: resolveMembersUrl(workspace.slug),
    openId: creatorAccount.openId,
    providerId: creatorAccount.providerId,
    workspaceName: workspace.name,
  };
}

export interface WorkspaceMemberJoinedNotificationDependencies {
  loadContext(input: {
    creatorUserId: string;
    joinedUserId: string;
    organizationId: string;
  }): Promise<WorkspaceMemberJoinedNotificationContext | null>;
  postCard(
    providerId: FeishuProviderId,
    openId: string,
    card: ReturnType<typeof WorkspaceMemberJoinedCard>,
  ): Promise<{ id: string }>;
}

const defaultDependencies: WorkspaceMemberJoinedNotificationDependencies = {
  loadContext: loadNotificationContext,
  postCard: async (providerId, openId, card) => {
    const { postFeishuDirectCard } = await import("@app/server/server/routes/feishu/utils/bot");
    return postFeishuDirectCard(providerId, openId, card);
  },
};

export async function notifyWorkspaceInviteCreatorMemberJoined(
  input: {
    creatorUserId: string | null;
    joinedUserId: string;
    organizationId: string;
  },
  dependencies: WorkspaceMemberJoinedNotificationDependencies = defaultDependencies,
): Promise<"sent" | "skipped"> {
  if (!input.creatorUserId || input.creatorUserId === input.joinedUserId) {
    return "skipped";
  }
  const context = await dependencies.loadContext({
    creatorUserId: input.creatorUserId,
    joinedUserId: input.joinedUserId,
    organizationId: input.organizationId,
  });
  if (!context) {
    return "skipped";
  }
  await dependencies.postCard(
    context.providerId,
    context.openId,
    WorkspaceMemberJoinedCard(context),
  );
  return "sent";
}

export async function notifyWorkspaceInviteCreatorMemberJoinedSafely(input: {
  creatorUserId: string | null;
  joinedUserId: string;
  organizationId: string;
}): Promise<void> {
  try {
    await notifyWorkspaceInviteCreatorMemberJoined(input);
  } catch (error) {
    console.warn("[workspace-invite] failed to notify invitation creator", {
      error: error instanceof Error ? error.message : "unknown error",
      organizationId: input.organizationId,
    });
  }
}
