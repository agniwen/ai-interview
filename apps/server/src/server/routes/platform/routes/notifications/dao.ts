import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { buildListTextFilterWhere } from "../../../../../lib/server/db/list-text-filters";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../lib/server/db/index";
import {
  account,
  aiInterviewConversation,
  recruitingNotificationDelivery,
  member,
  organization,
  user,
} from "@app/db-schema/schema";
import type { AgentNotificationStatus, AgentNotificationType } from "@app/db-schema/db-enums";
import { agentNotificationStatusSchema } from "@app/db-schema/db-enums";
import type { FeishuProviderId } from "../../../../integrations/feishu/provider";
import { FEISHU_PROVIDER_IDS } from "../../../../integrations/feishu/provider";
import type { InterviewNotificationEventType } from "@app/db-schema/interview-notifications";

export const platformNotificationStatusFilterValues = ["all", "pending", "sent", "failed"] as const;

export const platformNotificationProviderFilterValues = ["all", ...FEISHU_PROVIDER_IDS] as const;
const feishuProviderIdSchema = z.enum(FEISHU_PROVIDER_IDS);

export type PlatformNotificationStatusFilter =
  (typeof platformNotificationStatusFilterValues)[number];
export type PlatformNotificationProviderFilter =
  (typeof platformNotificationProviderFilterValues)[number];

export interface PlatformNotificationsQuery {
  page: number;
  pageSize: number;
  providerId?: PlatformNotificationProviderFilter;
  search?: string;
  textFilters?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: PlatformNotificationStatusFilter;
}

export interface PlatformNotificationRecord {
  candidateName: string;
  conversationId: string | null;
  createdAt: string;
  error: string | null;
  feishuDocumentUrl: string | null;
  feishuMessageId: string | null;
  id: string;
  interviewRecordId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  providerId: FeishuProviderId;
  recipientOpenId: string;
  recipientUser: {
    email: string | null;
    id: string | null;
    image: string | null;
    name: string | null;
  };
  scheduleEntryId: string | null;
  sentAt: string | null;
  status: AgentNotificationStatus;
  targetRole: string | null;
  type: AgentNotificationType | InterviewNotificationEventType;
  updatedAt: string;
}

export interface PlatformNotificationsResult {
  page: number;
  pageSize: number;
  records: PlatformNotificationRecord[];
  total: number;
  totalPages: number;
}

export interface PlatformNotificationResendRecipient {
  email: string;
  id: string;
  image: string | null;
  name: string;
}

export async function listPlatformNotificationResendRecipients(
  notificationId: string,
): Promise<{ records: PlatformNotificationResendRecipient[] } | null> {
  const [notification] = await db
    .select({
      organizationId: recruitingNotificationDelivery.organizationId,
      providerId: recruitingNotificationDelivery.providerId,
    })
    .from(recruitingNotificationDelivery)
    .where(eq(recruitingNotificationDelivery.id, notificationId))
    .limit(1);
  if (!notification) {
    return null;
  }

  const rows = await db
    .select({
      accountUpdatedAt: account.updatedAt,
      email: user.email,
      id: user.id,
      image: user.image,
      name: user.name,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .innerJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, notification.providerId)),
    )
    .where(eq(member.organizationId, notification.organizationId))
    .orderBy(asc(user.name), desc(account.updatedAt));

  const seen = new Set<string>();
  return {
    records: rows.flatMap((row) => {
      if (seen.has(row.id)) {
        return [];
      }
      seen.add(row.id);
      return [
        {
          email: row.email,
          id: row.id,
          image: row.image,
          name: row.name,
        },
      ];
    }),
  };
}

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function normalizeProviderId(
  value: PlatformNotificationProviderFilter | undefined,
): PlatformNotificationProviderFilter {
  return platformNotificationProviderFilterValues.includes(value ?? "all")
    ? (value ?? "all")
    : "all";
}

function normalizeStatus(
  value: PlatformNotificationStatusFilter | undefined,
): PlatformNotificationStatusFilter {
  return platformNotificationStatusFilterValues.includes(value ?? "all") ? (value ?? "all") : "all";
}

function notificationOrderBy(sortBy: string | undefined, sortOrder: "asc" | "desc" | undefined) {
  const orderDir = sortOrder === "asc" ? asc : desc;
  const fallback = desc(recruitingNotificationDelivery.createdAt);

  if (sortBy === "sentAt") {
    return [orderDir(recruitingNotificationDelivery.sentAt), fallback];
  }
  if (sortBy === "updatedAt") {
    return [orderDir(recruitingNotificationDelivery.updatedAt), fallback];
  }
  if (sortBy === "status") {
    return [orderDir(recruitingNotificationDelivery.status), fallback];
  }
  if (sortBy === "providerId") {
    return [orderDir(recruitingNotificationDelivery.providerId), fallback];
  }
  if (sortBy === "candidateName") {
    return [orderDir(recruitingRecordReadModel.candidateName), fallback];
  }
  if (sortBy === "organizationName") {
    return [orderDir(organization.name), fallback];
  }
  return [orderDir(recruitingNotificationDelivery.createdAt)];
}

export async function queryPaginatedPlatformNotifications(
  query: PlatformNotificationsQuery,
): Promise<PlatformNotificationsResult> {
  const page = Math.max(1, query.page);
  const pageSize = Math.min(Math.max(1, query.pageSize), 100);
  const providerId = normalizeProviderId(query.providerId);
  const status = normalizeStatus(query.status);
  const search = query.search?.trim() ?? "";

  const providerFilter =
    providerId === "all"
      ? inArray(
          recruitingNotificationDelivery.providerId,
          FEISHU_PROVIDER_IDS.map((id) => id),
        )
      : inArray(recruitingNotificationDelivery.providerId, [providerId]);
  const statusFilter =
    status === "all" ? undefined : eq(recruitingNotificationDelivery.status, status);
  const searchFilter = search
    ? or(
        ilike(recruitingRecordReadModel.candidateName, `%${search}%`),
        ilike(recruitingRecordReadModel.targetRole, `%${search}%`),
        ilike(organization.name, `%${search}%`),
        ilike(organization.slug, `%${search}%`),
        ilike(user.name, `%${search}%`),
        ilike(user.email, `%${search}%`),
        ilike(recruitingNotificationDelivery.providerId, `%${search}%`),
        ilike(recruitingNotificationDelivery.recipientOpenId, `%${search}%`),
        ilike(recruitingNotificationDelivery.feishuMessageId, `%${search}%`),
        ilike(recruitingNotificationDelivery.error, `%${search}%`),
      )
    : undefined;
  const where = and(
    // Keep the legacy platform view focused on the original AI-report
    // notifications; interview outbox deliveries have their own operations UI.
    isNull(recruitingNotificationDelivery.eventId),
    providerFilter,
    statusFilter,
    searchFilter,
    buildListTextFilterWhere("notifications", query.textFilters, {
      candidateName: recruitingRecordReadModel.candidateName,
      error: recruitingNotificationDelivery.error,
      messageId: recruitingNotificationDelivery.feishuMessageId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      recipientEmail: user.email,
      recipientName: user.name,
      recipientOpenId: recruitingNotificationDelivery.recipientOpenId,
      targetRole: recruitingRecordReadModel.targetRole,
    }),
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        candidateName: recruitingRecordReadModel.candidateName,
        conversationId: recruitingNotificationDelivery.conversationId,
        createdAt: recruitingNotificationDelivery.createdAt,
        error: recruitingNotificationDelivery.error,
        feishuDocumentUrl: recruitingNotificationDelivery.feishuDocumentUrl,
        feishuMessageId: recruitingNotificationDelivery.feishuMessageId,
        id: recruitingNotificationDelivery.id,
        interviewRecordId: recruitingNotificationDelivery.recruitingRecordId,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        providerId: recruitingNotificationDelivery.providerId,
        recipientEmail: user.email,
        recipientImage: user.image,
        recipientName: user.name,
        recipientOpenId: recruitingNotificationDelivery.recipientOpenId,
        recipientUserId: user.id,
        scheduleEntryId: aiInterviewConversation.aiRoundId,
        sentAt: recruitingNotificationDelivery.sentAt,
        status: recruitingNotificationDelivery.status,
        targetRole: recruitingRecordReadModel.targetRole,
        type: recruitingNotificationDelivery.type,
        updatedAt: recruitingNotificationDelivery.updatedAt,
      })
      .from(recruitingNotificationDelivery)
      .innerJoin(
        recruitingRecordReadModel,
        eq(recruitingRecordReadModel.id, recruitingNotificationDelivery.recruitingRecordId),
      )
      .leftJoin(
        aiInterviewConversation,
        eq(aiInterviewConversation.conversationId, recruitingNotificationDelivery.conversationId),
      )
      .innerJoin(organization, eq(organization.id, recruitingNotificationDelivery.organizationId))
      .leftJoin(user, eq(user.id, recruitingNotificationDelivery.recipientUserId))
      .where(where)
      .orderBy(...notificationOrderBy(query.sortBy, query.sortOrder))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(recruitingNotificationDelivery)
      .innerJoin(
        recruitingRecordReadModel,
        eq(recruitingRecordReadModel.id, recruitingNotificationDelivery.recruitingRecordId),
      )
      .leftJoin(
        aiInterviewConversation,
        eq(aiInterviewConversation.conversationId, recruitingNotificationDelivery.conversationId),
      )
      .innerJoin(organization, eq(organization.id, recruitingNotificationDelivery.organizationId))
      .leftJoin(user, eq(user.id, recruitingNotificationDelivery.recipientUserId))
      .where(where),
  ]);

  return {
    page,
    pageSize,
    records: rows.map((row) => ({
      candidateName: row.candidateName,
      conversationId: row.conversationId,
      createdAt: row.createdAt.toISOString(),
      error: row.error,
      feishuDocumentUrl: row.feishuDocumentUrl,
      feishuMessageId: row.feishuMessageId,
      id: row.id,
      interviewRecordId: row.interviewRecordId,
      organization: {
        id: row.organizationId,
        name: row.organizationName,
        slug: row.organizationSlug,
      },
      providerId: feishuProviderIdSchema.parse(row.providerId),
      recipientOpenId: row.recipientOpenId,
      recipientUser: {
        email: row.recipientEmail,
        id: row.recipientUserId,
        image: row.recipientImage,
        name: row.recipientName,
      },
      scheduleEntryId: row.scheduleEntryId,
      sentAt: toIsoString(row.sentAt),
      status: agentNotificationStatusSchema.parse(row.status),
      targetRole: row.targetRole,
      type: row.type,
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
