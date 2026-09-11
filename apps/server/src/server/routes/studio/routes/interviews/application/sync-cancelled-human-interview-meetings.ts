import { getFeishuTenantAccessToken } from "../../../../../../lib/server/feishu-access-token";
import {
  getFeishuAppCredentials,
  isFeishuHumanInterviewEnabled,
} from "../../../../../integrations/feishu/provider";
import type { FeishuProviderId } from "../../../../../integrations/feishu/provider";
import { and, asc, eq, inArray, isNotNull, lte, or } from "drizzle-orm";
import { humanInterviewMeeting } from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import { loadHumanInterviewMeetingById } from "../dao/human-interview-meetings";
import {
  isFeishuSyncConflictError,
  recordFeishuHumanInterviewSyncFailure,
  syncHumanInterviewMeetingToFeishu,
} from "../utils/feishu-human-interview-meeting";

export interface CancelledMeetingCalendarSyncFailure {
  meetingId: string;
  message: string;
  status: "creating" | "failed" | "unknown";
}

interface RetryableCancelledMeeting {
  meetingId: string;
  organizationId: string;
}

interface CancelledMeetingWithFeishu {
  feishu: { providerId: FeishuProviderId } | null;
  id: string;
}

export interface CancelledMeetingCalendarSyncDependencies {
  getAccessToken(providerId: FeishuProviderId): Promise<string>;
  isEnabled(): boolean;
  listRetryableMeetings(input: { limit: number; now: Date }): Promise<RetryableCancelledMeeting[]>;
  loadMeeting(
    meetingId: string,
    organizationId: string,
  ): Promise<CancelledMeetingWithFeishu | null>;
  recordFailure(input: {
    error: unknown;
    meetingId: string;
    organizationId: string;
  }): Promise<{ message: string; status: "failed" }>;
  syncMeeting(input: {
    accessToken: string;
    meetingId: string;
    organizationId: string;
    providerId: FeishuProviderId;
  }): Promise<void>;
}

const CANCELLED_CALENDAR_RETRY_DELAY_MS = 60_000;
const FEISHU_SYNC_STALE_AFTER_MS = 10 * 60 * 1000;
const RETRY_LIMIT = 20;

const defaultDependencies: CancelledMeetingCalendarSyncDependencies = {
  getAccessToken: (providerId) => {
    const credentials = getFeishuAppCredentials(providerId);
    return getFeishuTenantAccessToken(credentials.appId, credentials.appSecret);
  },
  isEnabled: isFeishuHumanInterviewEnabled,
  listRetryableMeetings: async ({ limit, now }) => {
    const retryBefore = new Date(now.getTime() - CANCELLED_CALENDAR_RETRY_DELAY_MS);
    const staleBefore = new Date(now.getTime() - FEISHU_SYNC_STALE_AFTER_MS);
    const meetings = await db
      .select({
        meetingId: humanInterviewMeeting.id,
        organizationId: humanInterviewMeeting.organizationId,
      })
      .from(humanInterviewMeeting)
      .where(
        and(
          eq(humanInterviewMeeting.status, "cancelled"),
          isNotNull(humanInterviewMeeting.feishuProviderId),
          or(
            and(
              inArray(humanInterviewMeeting.feishuSyncStatus, ["pending", "failed"]),
              lte(humanInterviewMeeting.updatedAt, retryBefore),
            ),
            and(
              eq(humanInterviewMeeting.feishuSyncStatus, "creating"),
              lte(humanInterviewMeeting.updatedAt, staleBefore),
            ),
          ),
        ),
      )
      .orderBy(asc(humanInterviewMeeting.updatedAt))
      .limit(limit);
    return meetings;
  },
  loadMeeting: loadHumanInterviewMeetingById,
  recordFailure: recordFeishuHumanInterviewSyncFailure,
  syncMeeting: async (input) => {
    await syncHumanInterviewMeetingToFeishu(input);
  },
};

export async function syncCancelledHumanInterviewMeetingCalendars(
  {
    meetingIds,
    organizationId,
  }: {
    meetingIds: string[];
    organizationId: string;
  },
  dependencies = defaultDependencies,
): Promise<CancelledMeetingCalendarSyncFailure | null> {
  if (!dependencies.isEnabled()) {
    return null;
  }
  let firstFailure: CancelledMeetingCalendarSyncFailure | null = null;
  for (const meetingId of meetingIds) {
    const meeting = await dependencies.loadMeeting(meetingId, organizationId);
    if (!meeting?.feishu) {
      continue;
    }
    try {
      const accessToken = await dependencies.getAccessToken(meeting.feishu.providerId);
      await dependencies.syncMeeting({
        accessToken,
        meetingId,
        organizationId,
        providerId: meeting.feishu.providerId,
      });
    } catch (error) {
      if (isFeishuSyncConflictError(error)) {
        firstFailure ??= { meetingId, message: error.message, status: error.feishuStatus };
        continue;
      }
      const failure = await dependencies.recordFailure({
        error,
        meetingId,
        organizationId,
      });
      firstFailure ??= { meetingId, message: failure.message, status: failure.status };
    }
  }
  return firstFailure;
}

export async function retryFailedCancelledHumanInterviewMeetingCalendars(
  {
    limit = RETRY_LIMIT,
    now = new Date(),
  }: {
    limit?: number;
    now?: Date;
  } = {},
  dependencies = defaultDependencies,
): Promise<{ attempted: number; failed: number; synced: number }> {
  if (!dependencies.isEnabled()) {
    return { attempted: 0, failed: 0, synced: 0 };
  }
  const meetings = await dependencies.listRetryableMeetings({ limit, now });
  let failed = 0;
  for (const meeting of meetings) {
    const failure = await syncCancelledHumanInterviewMeetingCalendars(
      {
        meetingIds: [meeting.meetingId],
        organizationId: meeting.organizationId,
      },
      dependencies,
    );
    if (failure) {
      failed += 1;
    }
  }
  return { attempted: meetings.length, failed, synced: meetings.length - failed };
}
