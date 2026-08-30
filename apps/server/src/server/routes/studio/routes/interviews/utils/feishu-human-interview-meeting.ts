/* oxlint-disable max-lines -- Feishu sync checkpoints stay together so retry state remains auditable. */
import { and, eq, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@app/server/lib/server/db";
import { FEISHU_PROVIDER_IDS } from "@app/server/server/routes/feishu/utils/provider";
import type { FeishuProviderId } from "@app/server/server/routes/feishu/utils/provider";
import type { HumanInterviewMeetingRecord } from "@arc/shared/studio-pipeline-stages";
import {
  account,
  member,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import {
  HumanInterviewMeetingError,
  loadHumanInterviewMeetingById,
} from "../dao/human-interview-meetings";
import {
  buildInterviewerInviteToken,
  buildInviteExpiry,
} from "../dao/human-interview-meeting-access";

const FEISHU_OPEN_API_BASE_URL = "https://open.feishu.cn/open-apis";
const FEISHU_SYNC_LEASE_DURATION_MS = 10 * 60 * 1000;

const interviewerRoleLabels = {
  host: "主持人",
  interviewer: "面试官",
  observer: "观察员",
} as const;

function absoluteAppUrl(path: string): string {
  const baseUrl = process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("未配置应用访问地址，无法生成飞书日程中的面试官入口。");
  }
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function buildCalendarDescription({
  candidates,
  interviewers,
  meetingId,
  notes,
  validUntil,
}: {
  candidates: { candidateName: string; roundLabel: string }[];
  interviewers: {
    id: string;
    name: string;
    role: keyof typeof interviewerRoleLabels;
  }[];
  meetingId: string;
  notes: string | null;
  validUntil: Date;
}): string {
  const inviteExpiry = Math.max(buildInviteExpiry(), validUntil.getTime());
  const candidateNames = [...new Set(candidates.map((candidate) => candidate.candidateName))];
  const roundLabels = [...new Set(candidates.map((candidate) => candidate.roundLabel))];
  const interviewerNames = interviewers.map(
    (interviewer) => `${interviewer.name}（${interviewerRoleLabels[interviewer.role]}）`,
  );
  const interviewerLinks = interviewers.map((interviewer) => {
    const token = buildInterviewerInviteToken({
      exp: inviteExpiry,
      meetingId,
      role: interviewer.role,
      userId: interviewer.id,
    });
    const url = absoluteAppUrl(`/human-interview/interviewer/${encodeURIComponent(token)}`);
    return `${interviewer.name}（${interviewerRoleLabels[interviewer.role]}）：${url}`;
  });
  const sections = [
    "真人复面安排",
    `候选人：${candidateNames.join("、")}`,
    `面试轮次：${roundLabels.join("、")}`,
    `面试官：${interviewerNames.join("、")}`,
    `在线面试入口（请点击本人对应的链接）\n${interviewerLinks.join("\n")}`,
    "请提前 5 分钟进入面试，并确认麦克风和摄像头可正常使用。\n本日程仅用于面试安排，在线面试将在招聘系统中进行。",
  ];
  if (notes?.trim()) {
    sections.push(`备注：${notes.trim()}`);
  }
  return sections.join("\n\n");
}

function feishuResponseSchema<T extends z.ZodType>(data: T) {
  return z.object({ code: z.number(), data: data.optional(), msg: z.string().optional() });
}

const addCalendarAttendeesResponseSchema = feishuResponseSchema(
  z.object({ attendees: z.array(z.object({ user_id: z.string().optional() })).optional() }),
);
const createCalendarEventResponseSchema = feishuResponseSchema(
  z.object({
    event: z
      .object({ app_link: z.string().optional(), event_id: z.string().optional() })
      .optional(),
  }),
);
const primaryCalendarResponseSchema = feishuResponseSchema(
  z.object({
    calendars: z
      .array(z.object({ calendar: z.object({ calendar_id: z.string().optional() }).optional() }))
      .optional(),
  }),
);
const resolveOpenIdsResponseSchema = feishuResponseSchema(
  z.object({
    user_list: z
      .array(z.object({ email: z.string().optional(), user_id: z.string().optional() }))
      .optional(),
  }),
);
const emptyFeishuResponseSchema = feishuResponseSchema(z.object({}));

async function loadSyncedMeeting(
  meetingId: string,
  organizationId: string,
): Promise<HumanInterviewMeetingRecord> {
  const meeting = await loadHumanInterviewMeetingById(meetingId, organizationId);
  if (!meeting) {
    throw new Error("同步后的真人复面会议读取失败。");
  }
  return meeting;
}

interface CreateCalendarEventInput {
  calendarId: string;
  description: string;
  endAt: Date;
  idempotencyKey: string;
  startAt: Date;
  title: string;
}

interface UpdateCalendarEventTimeInput {
  calendarId: string;
  description: string;
  endAt: Date;
  eventId: string;
  startAt: Date;
}

interface FeishuPartialAttendeeError extends Error {
  addedOpenIds: string[];
}

function createFeishuPartialAttendeeError(
  message: string,
  addedOpenIds: string[],
): FeishuPartialAttendeeError {
  return Object.assign(new Error(message), {
    addedOpenIds,
    name: "FeishuPartialAttendeeError",
  });
}

function isFeishuPartialAttendeeError(error: unknown): error is FeishuPartialAttendeeError {
  return error instanceof Error && error.name === "FeishuPartialAttendeeError";
}

interface FeishuSyncConflictError extends Error {
  feishuStatus: "creating" | "unknown";
}

function createFeishuSyncConflictError(
  message: string,
  feishuStatus: FeishuSyncConflictError["feishuStatus"],
): FeishuSyncConflictError {
  return Object.assign(new Error(message), {
    feishuStatus,
    name: "FeishuSyncConflictError",
  });
}

export function isFeishuSyncConflictError(error: unknown): error is FeishuSyncConflictError {
  return error instanceof Error && error.name === "FeishuSyncConflictError";
}

export async function resolveHumanInterviewFeishuProviderId({
  interviewerIds,
  organizationId,
}: {
  interviewerIds: string[];
  organizationId: string;
}): Promise<FeishuProviderId> {
  const uniqueInterviewerIds = [...new Set(interviewerIds)];
  const rows = await db
    .select({ providerId: account.providerId, userId: member.userId })
    .from(member)
    .leftJoin(
      account,
      and(eq(account.userId, member.userId), inArray(account.providerId, [...FEISHU_PROVIDER_IDS])),
    )
    .where(
      and(eq(member.organizationId, organizationId), inArray(member.userId, uniqueInterviewerIds)),
    );
  const providerIdsByInterviewer = new Map<string, Set<FeishuProviderId>>();
  for (const row of rows) {
    const providerIds = providerIdsByInterviewer.get(row.userId) ?? new Set<FeishuProviderId>();
    if (row.providerId === "feishu" || row.providerId === "feishu-jiguang-hr") {
      providerIds.add(row.providerId);
    }
    providerIdsByInterviewer.set(row.userId, providerIds);
  }
  if (providerIdsByInterviewer.size !== uniqueInterviewerIds.length) {
    throw new HumanInterviewMeetingError("存在不属于当前工作区的真人面试官。", 404);
  }

  let commonProviderIds = new Set<FeishuProviderId>(FEISHU_PROVIDER_IDS);
  for (const interviewerId of uniqueInterviewerIds) {
    const linkedProviderIds = providerIdsByInterviewer.get(interviewerId);
    const availableProviderIds =
      linkedProviderIds && linkedProviderIds.size > 0
        ? linkedProviderIds
        : new Set<FeishuProviderId>(["feishu-jiguang-hr"]);
    commonProviderIds = new Set(
      [...commonProviderIds].filter((providerId) => availableProviderIds.has(providerId)),
    );
  }
  if (commonProviderIds.has("feishu-jiguang-hr")) {
    return "feishu-jiguang-hr";
  }
  if (commonProviderIds.has("feishu")) {
    return "feishu";
  }
  throw new HumanInterviewMeetingError("所选面试官不属于同一个飞书应用来源。", 400);
}

export function createFeishuHumanInterviewClient({
  accessToken,
  fetch: fetchImplementation = globalThis.fetch,
}: {
  accessToken: string;
  fetch?: typeof fetch;
}) {
  return {
    async addCalendarAttendees({
      attendeeOpenIds,
      calendarId,
      eventId,
    }: {
      attendeeOpenIds: string[];
      calendarId: string;
      eventId: string;
    }): Promise<string[]> {
      const uniqueOpenIds = [...new Set(attendeeOpenIds)];
      const response = await fetchImplementation(
        `${FEISHU_OPEN_API_BASE_URL}/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/attendees?user_id_type=open_id`,
        {
          body: JSON.stringify({
            attendees: uniqueOpenIds.map((openId) => ({ type: "user", user_id: openId })),
            need_notification: true,
          }),
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json; charset=utf-8",
          },
          method: "POST",
        },
      );
      const result = addCalendarAttendeesResponseSchema.parse(await response.json());
      const addedOpenIds = result.data?.attendees
        ?.map((attendee) => attendee.user_id)
        .filter((openId): openId is string => typeof openId === "string");
      if (!response.ok || result.code !== 0 || !addedOpenIds) {
        throw new Error(`飞书日程参与人添加失败：${result.msg || result.code || response.status}`);
      }
      const addedOpenIdSet = new Set(addedOpenIds);
      const missingOpenIds = uniqueOpenIds.filter((openId) => !addedOpenIdSet.has(openId));
      if (missingOpenIds.length > 0) {
        throw createFeishuPartialAttendeeError(
          `部分参与人未成功加入飞书日程：${missingOpenIds.join("、")}`,
          addedOpenIds,
        );
      }
      return addedOpenIds;
    },
    async createCalendarEvent(input: CreateCalendarEventInput) {
      const query = new URLSearchParams({
        idempotency_key: input.idempotencyKey,
        user_id_type: "open_id",
      });
      const response = await fetchImplementation(
        `${FEISHU_OPEN_API_BASE_URL}/calendar/v4/calendars/${encodeURIComponent(input.calendarId)}/events?${query}`,
        {
          body: JSON.stringify({
            description: input.description,
            end_time: {
              timestamp: String(Math.floor(input.endAt.getTime() / 1000)),
              timezone: "Asia/Shanghai",
            },
            free_busy_status: "busy",
            start_time: {
              timestamp: String(Math.floor(input.startAt.getTime() / 1000)),
              timezone: "Asia/Shanghai",
            },
            summary: input.title,
          }),
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json; charset=utf-8",
          },
          method: "POST",
        },
      );
      const result = createCalendarEventResponseSchema.parse(await response.json());
      const event = result.data?.event;
      if (!response.ok || result.code !== 0 || !event?.app_link || !event.event_id) {
        throw new Error(`飞书日程创建失败：${result.msg || result.code || response.status}`);
      }
      return {
        calendarEventUrl: event.app_link,
        eventId: event.event_id,
      };
    },
    async getPrimaryCalendarId(): Promise<string> {
      const response = await fetchImplementation(
        `${FEISHU_OPEN_API_BASE_URL}/calendar/v4/calendars/primary?user_id_type=open_id`,
        {
          headers: { authorization: `Bearer ${accessToken}` },
          method: "POST",
        },
      );
      const result = primaryCalendarResponseSchema.parse(await response.json());
      const calendarId = result.data?.calendars?.[0]?.calendar?.calendar_id;
      if (!response.ok || result.code !== 0 || !calendarId) {
        throw new Error(`飞书主日历查询失败：${result.msg || result.code || response.status}`);
      }
      return calendarId;
    },
    async resolveOpenIdsByEmail(emails: string[]): Promise<Map<string, string>> {
      const response = await fetchImplementation(
        `${FEISHU_OPEN_API_BASE_URL}/contact/v3/users/batch_get_id?user_id_type=open_id`,
        {
          body: JSON.stringify({ emails, include_resigned: false }),
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json; charset=utf-8",
          },
          method: "POST",
        },
      );
      const result = resolveOpenIdsResponseSchema.parse(await response.json());
      if (!response.ok || result.code !== 0 || !result.data?.user_list) {
        throw new Error(`飞书用户身份查询失败：${result.msg || result.code || response.status}`);
      }
      return new Map(
        result.data.user_list.flatMap((item) =>
          item.email && item.user_id ? [[item.email, item.user_id] as const] : [],
        ),
      );
    },
    async updateCalendarEventTime(input: UpdateCalendarEventTimeInput): Promise<void> {
      const response = await fetchImplementation(
        `${FEISHU_OPEN_API_BASE_URL}/calendar/v4/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}?user_id_type=open_id`,
        {
          body: JSON.stringify({
            description: input.description,
            end_time: {
              timestamp: String(Math.floor(input.endAt.getTime() / 1000)),
              timezone: "Asia/Shanghai",
            },
            need_notification: true,
            start_time: {
              timestamp: String(Math.floor(input.startAt.getTime() / 1000)),
              timezone: "Asia/Shanghai",
            },
          }),
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json; charset=utf-8",
          },
          method: "PATCH",
        },
      );
      const result = emptyFeishuResponseSchema.parse(await response.json());
      if (!response.ok || result.code !== 0) {
        throw new Error(`飞书日程更新时间失败：${result.msg || result.code || response.status}`);
      }
    },
  };
}

// oxlint-disable-next-line complexity -- explicit checkpoint branches keep retries auditable.
export async function syncHumanInterviewMeetingToFeishu({
  accessToken,
  meetingId,
  organizationId,
  providerId,
}: {
  accessToken: string;
  meetingId: string;
  organizationId: string;
  providerId: FeishuProviderId;
}): Promise<HumanInterviewMeetingRecord> {
  let [meeting] = await db
    .select()
    .from(studioHumanInterviewMeeting)
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, meetingId),
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!meeting) {
    throw new Error("真人复面会议不存在。");
  }
  if (meeting.feishuSyncStatus === "ready") {
    return loadSyncedMeeting(meetingId, organizationId);
  }
  if (!meeting.scheduledAt) {
    throw new Error("请先设置真人复面时间，再创建飞书日程。");
  }
  const { scheduledAt } = meeting;
  const endAt = meeting.validUntil ?? new Date(scheduledAt.getTime() + 60 * 60 * 1000);

  const claimTime = new Date();
  const staleBefore = new Date(claimTime.getTime() - FEISHU_SYNC_LEASE_DURATION_MS);
  const [claimedMeeting] = await db
    .update(studioHumanInterviewMeeting)
    .set({
      feishuLastError: null,
      feishuSyncStatus: "creating",
      updatedAt: claimTime,
    })
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, meetingId),
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
        or(
          inArray(studioHumanInterviewMeeting.feishuSyncStatus, ["pending", "failed"]),
          and(
            eq(studioHumanInterviewMeeting.feishuSyncStatus, "creating"),
            lt(studioHumanInterviewMeeting.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning();
  if (!claimedMeeting) {
    const [currentMeeting] = await db
      .select()
      .from(studioHumanInterviewMeeting)
      .where(
        and(
          eq(studioHumanInterviewMeeting.id, meetingId),
          eq(studioHumanInterviewMeeting.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (currentMeeting?.feishuSyncStatus === "ready") {
      return loadSyncedMeeting(meetingId, organizationId);
    }
    if (currentMeeting?.feishuSyncStatus === "unknown") {
      throw createFeishuSyncConflictError(
        "历史飞书同步结果未知，请先在飞书中核查，不能直接重试。",
        "unknown",
      );
    }
    throw createFeishuSyncConflictError("飞书日程正在同步，请稍后再试。", "creating");
  }
  meeting = claimedMeeting;

  const interviewerRows = await db
    .select({
      feishuOpenId: studioHumanInterviewMeetingInterviewer.feishuOpenId,
      name: user.name,
      role: studioHumanInterviewMeetingInterviewer.role,
      userId: studioHumanInterviewMeetingInterviewer.userId,
    })
    .from(studioHumanInterviewMeetingInterviewer)
    .innerJoin(user, eq(studioHumanInterviewMeetingInterviewer.userId, user.id))
    .where(eq(studioHumanInterviewMeetingInterviewer.meetingId, meetingId));
  const interviewerIds = interviewerRows.map((row) => row.userId);
  const client = createFeishuHumanInterviewClient({ accessToken });
  const hostOpenIds: string[] = [];
  if (interviewerRows.every((interviewer) => interviewer.feishuOpenId)) {
    for (const interviewerRow of interviewerRows) {
      if (!interviewerRow.feishuOpenId) {
        throw new Error("飞书日程检查点缺少面试官身份，不能安全继续同步。");
      }
      hostOpenIds.push(interviewerRow.feishuOpenId);
    }
  } else {
    const participantIds = interviewerIds;
    const participants = await db
      .select({
        email: user.email,
        id: user.id,
        name: user.name,
        openId: account.accountId,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .leftJoin(account, and(eq(account.userId, user.id), eq(account.providerId, providerId)))
      .where(
        and(eq(member.organizationId, organizationId), inArray(member.userId, participantIds)),
      );
    const participantsById = new Map(
      participants.map((participant) => [participant.id, participant]),
    );
    const missingMembers = participantIds.filter((id) => !participantsById.has(id));
    if (missingMembers.length > 0) {
      throw new Error("面试官不属于当前工作区。");
    }

    const participantsMissingOpenId = participants.filter((participant) => !participant.openId);
    const openIdsByEmail =
      participantsMissingOpenId.length > 0
        ? await client.resolveOpenIdsByEmail(
            participantsMissingOpenId.map((participant) => participant.email),
          )
        : new Map<string, string>();
    const participantOpenIds = new Map(
      participants.map((participant) => [
        participant.id,
        participant.openId ?? openIdsByEmail.get(participant.email),
      ]),
    );
    const unresolvedNames = participants
      .filter((participant) => !participantOpenIds.get(participant.id))
      .map((participant) => participant.name);
    if (unresolvedNames.length > 0) {
      throw new Error(`以下人员未找到飞书账号：${unresolvedNames.join("、")}`);
    }

    for (const interviewerId of interviewerIds) {
      const hostOpenId = participantOpenIds.get(interviewerId);
      if (!hostOpenId) {
        throw new Error("部分面试官未找到飞书账号。");
      }
      hostOpenIds.push(hostOpenId);
    }

    for (const interviewerId of interviewerIds) {
      await db
        .update(studioHumanInterviewMeetingInterviewer)
        .set({ feishuOpenId: participantOpenIds.get(interviewerId) })
        .where(
          and(
            eq(studioHumanInterviewMeetingInterviewer.meetingId, meetingId),
            eq(studioHumanInterviewMeetingInterviewer.userId, interviewerId),
          ),
        );
    }
  }

  const candidateRows = await db
    .select({
      candidateName: studioInterview.candidateName,
      roundLabel: studioHumanInterviewRound.label,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .where(eq(studioHumanInterviewMeetingRound.meetingId, meetingId));
  const description = buildCalendarDescription({
    candidates: candidateRows,
    interviewers: interviewerRows.map((interviewer) => ({
      id: interviewer.userId,
      name: interviewer.name ?? "未命名",
      role: interviewer.role,
    })),
    meetingId,
    notes: meeting.notes,
    validUntil: endAt,
  });

  const calendarId = meeting.feishuCalendarId ?? (await client.getPrimaryCalendarId());
  if (!meeting.feishuCalendarId) {
    await db
      .update(studioHumanInterviewMeeting)
      .set({ feishuCalendarId: calendarId, updatedAt: new Date() })
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
  }

  let eventId = meeting.feishuCalendarEventId;
  if (eventId) {
    await client.updateCalendarEventTime({
      calendarId,
      description,
      endAt,
      eventId,
      startAt: scheduledAt,
    });
  } else {
    const event = await client.createCalendarEvent({
      calendarId,
      description,
      endAt,
      idempotencyKey: `human-interview-meeting-${meeting.id}`,
      startAt: scheduledAt,
      title: meeting.title,
    });
    ({ eventId } = event);
    await db
      .update(studioHumanInterviewMeeting)
      .set({
        feishuCalendarEventId: event.eventId,
        feishuCalendarEventUrl: event.calendarEventUrl,
        updatedAt: new Date(),
      })
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
  }

  const attendeeOpenIds = hostOpenIds;
  const alreadyAddedOpenIds = new Set(meeting.feishuAttendeeOpenIds);
  const missingAttendeeOpenIds = attendeeOpenIds.filter(
    (openId) => !alreadyAddedOpenIds.has(openId),
  );
  if (missingAttendeeOpenIds.length > 0) {
    let addedOpenIds: string[];
    try {
      addedOpenIds = await client.addCalendarAttendees({
        attendeeOpenIds: missingAttendeeOpenIds,
        calendarId,
        eventId,
      });
    } catch (error) {
      if (isFeishuPartialAttendeeError(error)) {
        for (const openId of error.addedOpenIds) {
          alreadyAddedOpenIds.add(openId);
        }
        await db
          .update(studioHumanInterviewMeeting)
          .set({ feishuAttendeeOpenIds: [...alreadyAddedOpenIds], updatedAt: new Date() })
          .where(eq(studioHumanInterviewMeeting.id, meetingId));
      }
      throw error;
    }
    for (const openId of addedOpenIds) {
      alreadyAddedOpenIds.add(openId);
    }
    await db
      .update(studioHumanInterviewMeeting)
      .set({ feishuAttendeeOpenIds: [...alreadyAddedOpenIds], updatedAt: new Date() })
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
  }

  await db
    .update(studioHumanInterviewMeeting)
    .set({
      feishuLastError: null,
      feishuSyncStatus: "ready",
      feishuSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(studioHumanInterviewMeeting.id, meetingId));

  return loadSyncedMeeting(meetingId, organizationId);
}

export async function recordFeishuHumanInterviewSyncFailure({
  error,
  meetingId,
  organizationId,
}: {
  error: unknown;
  meetingId: string;
  organizationId: string;
}) {
  const message = error instanceof Error ? error.message : "飞书日程同步失败。";
  const status = "failed" as const;
  await db
    .update(studioHumanInterviewMeeting)
    .set({
      feishuLastError: message.slice(0, 1000),
      feishuSyncStatus: status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, meetingId),
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
      ),
    );
  return { message, status } as const;
}
