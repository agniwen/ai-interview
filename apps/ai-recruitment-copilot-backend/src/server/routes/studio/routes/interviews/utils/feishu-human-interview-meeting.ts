import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { FEISHU_PROVIDER_IDS } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";
import type { FeishuProviderId } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";
import {
  account,
  member,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  user,
} from "@arc/db-schema/schema";
import {
  HumanInterviewMeetingError,
  loadHumanInterviewMeetingById,
} from "../dao/human-interview-meetings";

const FEISHU_OPEN_API_BASE_URL = "https://open.feishu.cn/open-apis";
const FEISHU_SYNC_LEASE_DURATION_MS = 10 * 60 * 1000;

interface FeishuResponse<T> {
  code: number;
  data?: T;
  msg?: string;
}

interface CreateReserveInput {
  endAt: Date;
  hostOpenIds: string[];
  ownerOpenId: string;
  title: string;
}

interface CreateReserveResponse {
  reserve: {
    app_link?: string;
    id?: string;
    meeting_no?: string;
    url?: string;
  };
  reserve_correction_check_info?: {
    invalid_host_id_list?: string[];
  };
}

interface CreateCalendarEventInput {
  calendarId: string;
  description: string;
  endAt: Date;
  idempotencyKey: string;
  meetingUrl: string;
  startAt: Date;
  title: string;
}

interface CreateCalendarEventResponse {
  event?: {
    app_link?: string;
    event_id?: string;
  };
}

interface AddCalendarAttendeesResponse {
  attendees?: {
    user_id?: string;
  }[];
}

interface ResolveOpenIdsResponse {
  user_list?: {
    email?: string;
    user_id?: string;
  }[];
}

interface PrimaryCalendarResponse {
  calendars?: {
    calendar?: {
      calendar_id?: string;
    };
  }[];
}

export interface FeishuReserve {
  appLink: string;
  meetingNo: string;
  meetingUrl: string;
  reserveId: string;
}

export class FeishuReserveResultUnknownError extends Error {
  override name = "FeishuReserveResultUnknownError";

  readonly canResumeAfterCheckpoint: boolean;

  readonly reserve: FeishuReserve | null;

  constructor(
    message: string,
    reserve: FeishuReserve | null = null,
    options: { canResumeAfterCheckpoint?: boolean } = {},
  ) {
    super(message);
    this.canResumeAfterCheckpoint = options.canResumeAfterCheckpoint ?? false;
    this.reserve = reserve;
  }
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
      const result = (await response.json()) as FeishuResponse<AddCalendarAttendeesResponse>;
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
            vchat: {
              description: "加入飞书会议",
              icon_type: "vc",
              meeting_url: input.meetingUrl,
              vc_type: "third_party",
            },
          }),
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json; charset=utf-8",
          },
          method: "POST",
        },
      );
      const result = (await response.json()) as FeishuResponse<CreateCalendarEventResponse>;
      const event = result.data?.event;
      if (!response.ok || result.code !== 0 || !event?.app_link || !event.event_id) {
        throw new Error(`飞书日程创建失败：${result.msg || result.code || response.status}`);
      }
      return {
        calendarEventUrl: event.app_link,
        eventId: event.event_id,
      };
    },
    async createReserve(input: CreateReserveInput): Promise<FeishuReserve> {
      let response: Response;
      try {
        response = await fetchImplementation(
          `${FEISHU_OPEN_API_BASE_URL}/vc/v1/reserves/apply?user_id_type=open_id`,
          {
            body: JSON.stringify({
              end_time: String(Math.floor(input.endAt.getTime() / 1000)),
              meeting_settings: {
                assign_host_list: input.hostOpenIds.map((id) => ({ id, user_type: 1 })),
                auto_record: false,
                topic: input.title,
              },
              owner_id: input.ownerOpenId,
            }),
            headers: {
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json; charset=utf-8",
            },
            method: "POST",
          },
        );
      } catch (error) {
        throw new FeishuReserveResultUnknownError(
          `飞书会议创建请求结果未知：${error instanceof Error ? error.message : "网络错误"}`,
        );
      }
      let result: FeishuResponse<CreateReserveResponse>;
      try {
        result = (await response.json()) as FeishuResponse<CreateReserveResponse>;
      } catch (error) {
        throw new FeishuReserveResultUnknownError(
          `飞书会议创建响应无法读取，结果未知：${error instanceof Error ? error.message : "响应解析失败"}`,
        );
      }
      const reserve = result.data?.reserve;
      if (!response.ok || result.code !== 0) {
        throw new Error(`飞书会议创建失败：${result.msg || result.code || response.status}`);
      }
      if (!reserve?.app_link || !reserve.id || !reserve.meeting_no || !reserve.url) {
        throw new FeishuReserveResultUnknownError(
          "飞书会议创建成功响应缺少必要字段，结果需要人工核查。",
        );
      }
      const createdReserve = {
        appLink: reserve.app_link,
        meetingNo: reserve.meeting_no,
        meetingUrl: reserve.url,
        reserveId: reserve.id,
      };
      const invalidHostIds = result.data?.reserve_correction_check_info?.invalid_host_id_list ?? [];
      if (invalidHostIds.length > 0) {
        throw new FeishuReserveResultUnknownError(
          `以下面试官无法设置为飞书会议主持人：${invalidHostIds.join("、")}`,
          createdReserve,
        );
      }
      return createdReserve;
    },
    async getPrimaryCalendarId(): Promise<string> {
      const response = await fetchImplementation(
        `${FEISHU_OPEN_API_BASE_URL}/calendar/v4/calendars/primary?user_id_type=open_id`,
        {
          headers: { authorization: `Bearer ${accessToken}` },
          method: "POST",
        },
      );
      const result = (await response.json()) as FeishuResponse<PrimaryCalendarResponse>;
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
      const result = (await response.json()) as FeishuResponse<ResolveOpenIdsResponse>;
      if (!response.ok || result.code !== 0 || !result.data?.user_list) {
        throw new Error(`飞书用户身份查询失败：${result.msg || result.code || response.status}`);
      }
      return new Map(
        result.data.user_list.flatMap((item) =>
          item.email && item.user_id ? [[item.email, item.user_id] as const] : [],
        ),
      );
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
}) {
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
    return loadHumanInterviewMeetingById(meetingId, organizationId);
  }
  if (!meeting.scheduledAt) {
    throw new Error("请先设置真人复面时间，再创建飞书会议。");
  }
  const { scheduledAt } = meeting;

  const claimTime = new Date();
  const staleBefore = new Date(claimTime.getTime() - FEISHU_SYNC_LEASE_DURATION_MS);
  const [abandonedCreation] = await db
    .update(studioHumanInterviewMeeting)
    .set({
      feishuLastError: "飞书会议创建过程被中断，远端结果需要人工核查。",
      feishuSyncStatus: "unknown",
      updatedAt: claimTime,
    })
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, meetingId),
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
        eq(studioHumanInterviewMeeting.feishuSyncStatus, "creating"),
        lt(studioHumanInterviewMeeting.updatedAt, staleBefore),
        isNull(studioHumanInterviewMeeting.feishuReserveId),
      ),
    )
    .returning({ id: studioHumanInterviewMeeting.id });
  if (abandonedCreation) {
    throw createFeishuSyncConflictError(
      "飞书会议创建过程曾被中断，请先在飞书中核查，不能直接重试。",
      "unknown",
    );
  }

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
            isNotNull(studioHumanInterviewMeeting.feishuReserveId),
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
      return loadHumanInterviewMeetingById(meetingId, organizationId);
    }
    if (currentMeeting?.feishuSyncStatus === "unknown") {
      throw createFeishuSyncConflictError(
        "飞书会议创建结果未知，请先在飞书中核查，不能直接重试。",
        "unknown",
      );
    }
    throw createFeishuSyncConflictError("飞书会议正在同步，请稍后再试。", "creating");
  }
  meeting = claimedMeeting;

  const interviewerRows = await db
    .select({
      feishuOpenId: studioHumanInterviewMeetingInterviewer.feishuOpenId,
      role: studioHumanInterviewMeetingInterviewer.role,
      userId: studioHumanInterviewMeetingInterviewer.userId,
    })
    .from(studioHumanInterviewMeetingInterviewer)
    .where(eq(studioHumanInterviewMeetingInterviewer.meetingId, meetingId));
  const interviewerIds = interviewerRows.map((row) => row.userId);
  const client = createFeishuHumanInterviewClient({ accessToken });
  const hasReserveCheckpoint = Boolean(meeting.feishuReserveId || meeting.feishuMeetingUrl);
  let ownerOpenId: string;
  const hostOpenIds: string[] = [];
  if (hasReserveCheckpoint) {
    if (!meeting.feishuOwnerOpenId) {
      throw new Error("飞书预约检查点缺少会议 owner 身份，不能安全继续同步。");
    }
    ownerOpenId = meeting.feishuOwnerOpenId;
    for (const interviewerRow of interviewerRows) {
      if (!interviewerRow.feishuOpenId) {
        throw new Error("飞书预约检查点缺少面试官身份，不能安全继续同步。");
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

    const ownerInterviewer = interviewerRows.find((interviewer) => interviewer.role === "host");
    const resolvedOwnerOpenId = ownerInterviewer
      ? participantOpenIds.get(ownerInterviewer.userId)
      : undefined;
    if (!resolvedOwnerOpenId) {
      throw new Error("首位面试官未找到飞书账号。");
    }
    ownerOpenId = resolvedOwnerOpenId;
    for (const interviewerId of interviewerIds) {
      const hostOpenId = participantOpenIds.get(interviewerId);
      if (!hostOpenId) {
        throw new Error("部分面试官未找到飞书账号。");
      }
      hostOpenIds.push(hostOpenId);
    }

    await db
      .update(studioHumanInterviewMeeting)
      .set({
        feishuOwnerOpenId: ownerOpenId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioHumanInterviewMeeting.id, meetingId),
          eq(studioHumanInterviewMeeting.organizationId, organizationId),
        ),
      );
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

  let reserve = meeting.feishuMeetingUrl
    ? {
        appLink: meeting.feishuAppLink,
        meetingNo: meeting.feishuMeetingNo,
        meetingUrl: meeting.feishuMeetingUrl,
        reserveId: meeting.feishuReserveId,
      }
    : null;
  if (!reserve) {
    const createdReserve = await client.createReserve({
      endAt: new Date(scheduledAt.getTime() + 60 * 60 * 1000),
      hostOpenIds,
      ownerOpenId,
      title: meeting.title,
    });
    try {
      const [checkpoint] = await db
        .update(studioHumanInterviewMeeting)
        .set({
          feishuAppLink: createdReserve.appLink,
          feishuMeetingNo: createdReserve.meetingNo,
          feishuMeetingUrl: createdReserve.meetingUrl,
          feishuReserveId: createdReserve.reserveId,
          updatedAt: new Date(),
        })
        .where(eq(studioHumanInterviewMeeting.id, meetingId))
        .returning({ id: studioHumanInterviewMeeting.id });
      if (!checkpoint) {
        throw new Error("真人复面会议检查点不存在。");
      }
    } catch (error) {
      throw new FeishuReserveResultUnknownError(
        `飞书会议已创建，但本地检查点保存失败：${error instanceof Error ? error.message : "数据库错误"}`,
        createdReserve,
        { canResumeAfterCheckpoint: true },
      );
    }
    reserve = createdReserve;
  }

  const calendarId = meeting.feishuCalendarId ?? (await client.getPrimaryCalendarId());
  if (!meeting.feishuCalendarId) {
    await db
      .update(studioHumanInterviewMeeting)
      .set({ feishuCalendarId: calendarId, updatedAt: new Date() })
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
  }

  let eventId = meeting.feishuCalendarEventId;
  if (!eventId) {
    const event = await client.createCalendarEvent({
      calendarId,
      description: meeting.notes ?? `真人面试：${meeting.title}`,
      endAt: new Date(scheduledAt.getTime() + 60 * 60 * 1000),
      idempotencyKey: `human-interview-meeting-${meeting.id}`,
      meetingUrl: reserve.meetingUrl,
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

  const [roundLinks] = await Promise.all([
    db
      .select({ roundId: studioHumanInterviewMeetingRound.roundId })
      .from(studioHumanInterviewMeetingRound)
      .where(eq(studioHumanInterviewMeetingRound.meetingId, meetingId)),
    db
      .update(studioHumanInterviewMeeting)
      .set({
        feishuLastError: null,
        feishuSyncStatus: "ready",
        feishuSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(studioHumanInterviewMeeting.id, meetingId)),
  ]);
  if (roundLinks.length > 0) {
    await db
      .update(studioHumanInterviewRound)
      .set({ meetingUrl: reserve.meetingUrl, updatedAt: new Date() })
      .where(
        inArray(
          studioHumanInterviewRound.id,
          roundLinks.map((row) => row.roundId),
        ),
      );
  }

  return loadHumanInterviewMeetingById(meetingId, organizationId);
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
  const message = error instanceof Error ? error.message : "飞书会议同步失败。";
  const reserve = error instanceof FeishuReserveResultUnknownError ? error.reserve : null;
  let status: "failed" | "unknown" = "failed";
  if (
    error instanceof FeishuReserveResultUnknownError &&
    (!reserve || !error.canResumeAfterCheckpoint)
  ) {
    status = "unknown";
  }
  await db
    .update(studioHumanInterviewMeeting)
    .set({
      ...(reserve
        ? {
            feishuAppLink: reserve.appLink,
            feishuMeetingNo: reserve.meetingNo,
            feishuMeetingUrl: reserve.meetingUrl,
            feishuReserveId: reserve.reserveId,
          }
        : {}),
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
