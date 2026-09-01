/* oxlint-disable anti-slop/no-known-value-widening, anti-slop/require-safety-comment-for-type-assertion, class-methods-use-this, max-lines, no-empty-function, no-nested-ternary, no-shadow, no-useless-return, typescript/consistent-type-imports, unicorn/no-await-expression-member, unicorn/no-nested-ternary -- Platform diagnostics aggregate queue, LiveKit, mail, cache, and Feishu provider contracts in one parity service; provider SDK types and deliberate no-op probes are normalized at their boundaries. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RoomServiceClient } from "livekit-server-sdk";
import { matchesListTextFilters, parseListTextFilters } from "@arc/shared/list-text-filters";
import {
  CANDIDATE_DOCUMENT_ADMIN_COMMANDS,
  CANDIDATE_NOTIFICATION_ADMIN_COMMANDS,
  MAIL_INGEST_ADMIN_COMMANDS,
} from "../../candidate-lifecycle/public.js";
import type {
  CandidateDocumentAdminCommands,
  CandidateNotificationAdminCommands,
  MailIngestAdminCommands,
  MailIngestAdminError,
} from "../../candidate-lifecycle/public.js";
import { PLATFORM_OPERATIONAL_READ_MODEL } from "../infrastructure/platform-operational-read-model.port.js";
import type { PlatformOperationalReadModel } from "../infrastructure/platform-operational-read-model.port.js";
import type { PlatformOperationsPort } from "./platform.port.js";
import type {
  platformCreateMailAccountSchema,
  platformLiveKitMetricsQuerySchema,
  platformLiveKitRoomsQuerySchema,
  platformMailAccountsQuerySchema,
  platformNotificationsQuerySchema,
  platformQueueJobsQuerySchema,
  platformResumeParseCacheQuerySchema,
  platformUpdateMailAccountSchema,
} from "./platform.schemas.js";
import { z } from "zod";
import { syncInterviewEvaluationDocument } from "./feishu-document-structure.js";

type CandidateAdminError =
  | MailIngestAdminError
  | { code: "PLATFORM_NOTIFICATION_NOT_FOUND" }
  | { code: "RESUME_PARSE_CACHE_NOT_FOUND" };

function unwrapCandidateAdminResult<T>(
  result: { value: T; ok: true } | { error: CandidateAdminError; ok: false },
): T {
  if (result.ok) {
    return result.value;
  }
  if (result.error.code === "MAIL_INGEST_MEMBER_NOT_FOUND") {
    throw new NotFoundException("Workspace member not found", {
      errorCode: result.error.code,
    });
  }
  if (result.error.code === "MAIL_INGEST_ACCOUNT_NOT_FOUND") {
    throw new NotFoundException("Mail ingest account not found", {
      errorCode: result.error.code,
    });
  }
  if (result.error.code === "MAIL_INGEST_SECRET_MISSING") {
    throw new BadRequestException("Mail ingest encryption is not configured", {
      errorCode: result.error.code,
    });
  }
  if (result.error.code === "MAIL_INGEST_LOGIN_FAILED") {
    throw new BadRequestException(result.error.message, {
      errorCode: result.error.code,
    });
  }
  if (result.error.code === "RESUME_PARSE_CACHE_NOT_FOUND") {
    throw new NotFoundException("Resume parse cache entry not found", {
      errorCode: result.error.code,
    });
  }
  throw new NotFoundException("Notification not found", {
    errorCode: result.error.code,
  });
}

function paginate<T>(records: T[], page: number, pageSize: number) {
  const total = records.length;
  return {
    page,
    pageSize,
    records: records.slice((page - 1) * pageSize, page * pageSize),
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

function liveKitUrl() {
  const value = rawBackendEnvironment.LIVEKIT_URL?.trim();
  if (!value) {
    throw new Error("LiveKit is not configured");
  }
  const url = new URL(value);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  }
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  return url.origin;
}

function roomRecord(room: Awaited<ReturnType<RoomServiceClient["listRooms"]>>[number]) {
  const created =
    room.creationTimeMs > 0n ? Number(room.creationTimeMs) : Number(room.creationTime) * 1000;
  return {
    activeRecording: room.activeRecording,
    createdAt: created > 0 ? new Date(created).toISOString() : null,
    emptyTimeout: room.emptyTimeout,
    maxParticipants: room.maxParticipants,
    name: room.name,
    numParticipants: room.numParticipants,
    numPublishers: room.numPublishers,
    sid: room.sid,
  };
}

function participantStateLabel(state: number) {
  return ["连接中", "已连接", "活跃", "已断开"][state] ?? `未知 (${state})`;
}

function participantKindLabel(kind: number) {
  return (
    new Map([
      [0, "标准用户"],
      [1, "Ingress"],
      [2, "Egress"],
      [3, "SIP"],
      [4, "Agent"],
      [7, "Connector"],
      [8, "Bridge"],
    ]).get(kind) ?? `未知 (${kind})`
  );
}

function trackTypeLabel(type: number) {
  return ["音频", "视频", "数据"][type] ?? `未知 (${type})`;
}

function trackSourceLabel(source: number) {
  return (
    new Map([
      [0, "未知"],
      [1, "摄像头"],
      [2, "麦克风"],
      [3, "屏幕共享"],
      [4, "屏幕共享音频"],
    ]).get(source) ?? `未知 (${source})`
  );
}

function participantRecord(
  participant: Awaited<ReturnType<RoomServiceClient["listParticipants"]>>[number],
) {
  const joined =
    participant.joinedAtMs > 0n
      ? Number(participant.joinedAtMs)
      : Number(participant.joinedAt) * 1000;
  return {
    attributes: participant.attributes,
    identity: participant.identity,
    isPublisher: participant.isPublisher,
    joinedAt: joined > 0 ? new Date(joined).toISOString() : null,
    kind: participantKindLabel(participant.kind),
    metadata: participant.metadata,
    name: participant.name,
    region: participant.region,
    sid: participant.sid,
    state: participantStateLabel(participant.state),
    tracks: participant.tracks.map((track) => ({
      height: track.height,
      mimeType: track.mimeType,
      muted: track.muted,
      name: track.name,
      sid: track.sid,
      source: trackSourceLabel(track.source),
      type: trackTypeLabel(track.type),
      width: track.width,
    })),
  };
}

function parseMetrics(text: string) {
  const help = new Map<string, string>();
  const types = new Map<string, string>();
  const records: {
    help: string | null;
    labels: Record<string, string>;
    name: string;
    type: string | null;
    value: number | string;
  }[] = [];
  for (const line of text.split("\n")) {
    const helpMatch = /^# HELP\s+(\S+)\s+(.+)$/u.exec(line);
    if (helpMatch) {
      help.set(helpMatch[1], helpMatch[2]);
      continue;
    }
    const typeMatch = /^# TYPE\s+(\S+)\s+(\S+)$/u.exec(line);
    if (typeMatch) {
      types.set(typeMatch[1], typeMatch[2]);
      continue;
    }
    const metric = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)(?:\s+\d+)?$/u.exec(line);
    if (!metric) {
      continue;
    }
    const labels = Object.fromEntries(
      [...(metric[2] ?? "").matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/gu)].map(
        (match) => [match[1], match[2].replaceAll('\\"', '"').replaceAll("\\\\", "\\")],
      ),
    );
    const numeric = Number(metric[3]);
    records.push({
      help: help.get(metric[1]) ?? null,
      labels,
      name: metric[1],
      type: types.get(metric[1]) ?? null,
      value: Number.isFinite(numeric) ? numeric : metric[3],
    });
  }
  return records;
}

@Injectable()
export class PlatformOperationsService implements PlatformOperationsPort {
  constructor(
    @Inject(PLATFORM_OPERATIONAL_READ_MODEL)
    private readonly readModel: PlatformOperationalReadModel,
    @Inject(MAIL_INGEST_ADMIN_COMMANDS)
    private readonly mailIngestAdmin: MailIngestAdminCommands,
    @Inject(CANDIDATE_DOCUMENT_ADMIN_COMMANDS)
    private readonly candidateDocumentAdmin: CandidateDocumentAdminCommands,
    @Inject(CANDIDATE_NOTIFICATION_ADMIN_COMMANDS)
    private readonly candidateNotificationAdmin: CandidateNotificationAdminCommands,
  ) {}

  listMailAccounts(query: z.infer<typeof platformMailAccountsQuerySchema>) {
    return this.readModel.listMailAccounts(query);
  }

  async createMailAccount(input: z.infer<typeof platformCreateMailAccountSchema>) {
    return unwrapCandidateAdminResult(await this.mailIngestAdmin.create(input));
  }

  async updateMailAccount(id: string, input: z.infer<typeof platformUpdateMailAccountSchema>) {
    return unwrapCandidateAdminResult(await this.mailIngestAdmin.update(id, input));
  }

  async listQueues() {
    const [{ getResumeParseQueueOverview }, { getResumeReviewGenerationQueueOverview }] =
      await Promise.all([
        import("@arc/resume-parse-queue/resume-parse"),
        import("@arc/resume-parse-queue/resume-review-generation"),
      ]);
    const records = await Promise.all([
      getResumeParseQueueOverview(),
      getResumeReviewGenerationQueueOverview(),
    ]);
    return { records, total: records.length };
  }

  async getQueueJobs(queueName: string, query: z.infer<typeof platformQueueJobsQuerySchema>) {
    const resume = await import("@arc/resume-parse-queue/resume-parse");
    const review = await import("@arc/resume-parse-queue/resume-review-generation");
    if (queueName === review.RESUME_REVIEW_GENERATION_QUEUE_NAME) {
      const result = await review.listResumeReviewGenerationQueueJobs({
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        state: query.state,
      });
      return {
        ...result,
        records: result.records.map((record) => ({
          ...record,
          organization: null,
          resumeDetail: null,
          triggeredBy: null,
        })),
      };
    }
    if (queueName !== resume.RESUME_PARSE_QUEUE_NAME) {
      throw new NotFoundException("Queue not found", { errorCode: "PLATFORM_QUEUE_NOT_FOUND" });
    }
    if (query.parseStatus === "all" && query.uploadStatus === "all") {
      return this.enrichResumeQueueJobs(
        await resume.listResumeParseQueueJobs({
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          state: query.state,
        }),
      );
    }
    const records = await resume.listAllResumeParseQueueJobs({
      search: query.search,
      state: query.state,
    });
    const enriched = await this.enrichResumeQueueJobs({
      page: 1,
      pageSize: Math.max(1, records.length),
      records,
      state: query.state,
      total: records.length,
      totalPages: records.length > 0 ? 1 : 0,
    });
    const filtered = enriched.records.filter((record) => {
      if (!record.resumeDetail) {
        return false;
      }
      return (
        (query.uploadStatus === "all" || record.resumeDetail.itemStatus === query.uploadStatus) &&
        (query.parseStatus === "all" || record.resumeDetail.resumeParseStatus === query.parseStatus)
      );
    });
    const offset = (query.page - 1) * query.pageSize;
    return {
      ...enriched,
      page: query.page,
      pageSize: query.pageSize,
      records: filtered.slice(offset, offset + query.pageSize),
      total: filtered.length,
      totalPages: filtered.length > 0 ? Math.ceil(filtered.length / query.pageSize) : 0,
    };
  }

  listResumeParseCache(query: z.infer<typeof platformResumeParseCacheQuerySchema>) {
    return this.readModel.listResumeParseCache(query);
  }

  private async enrichResumeQueueJobs(
    result: Awaited<
      ReturnType<
        (typeof import("@arc/resume-parse-queue/resume-parse"))["listResumeParseQueueJobs"]
      >
    >,
  ) {
    const itemIds = result.records.flatMap((record) => {
      const parsed = z
        .object({ itemId: z.string().min(1) })
        .passthrough()
        .safeParse(record.data);
      return parsed.success ? [parsed.data.itemId] : [];
    });
    const uniqueItemIds = [...new Set(itemIds)];
    const rows = await this.readModel.getResumeQueueJobDetails(uniqueItemIds);
    const details = new Map(rows.map((row) => [row.itemId, row]));
    return {
      ...result,
      records: result.records.map((record) => {
        const parsed = z
          .object({ itemId: z.string().min(1) })
          .passthrough()
          .safeParse(record.data);
        const detail = parsed.success ? (details.get(parsed.data.itemId) ?? null) : null;
        return {
          ...record,
          organization: detail
            ? {
                id: detail.organizationId,
                name: detail.organizationName,
                slug: detail.organizationSlug,
              }
            : null,
          resumeDetail: detail,
          triggeredBy: detail
            ? {
                email: detail.userEmail,
                id: detail.userId,
                image: detail.userImage,
                name: detail.userName,
              }
            : null,
        };
      }),
    };
  }

  async getResumeParseCache(hash: string) {
    const row = await this.readModel.getResumeParseCache(hash);
    if (!row) {
      throw new NotFoundException("Resume parse cache entry not found", {
        errorCode: "RESUME_PARSE_CACHE_NOT_FOUND",
      });
    }
    return row;
  }

  async deleteResumeParseCache(hash: string) {
    return unwrapCandidateAdminResult(
      await this.candidateDocumentAdmin.resetResumeParseCache(hash),
    );
  }

  listNotifications(query: z.infer<typeof platformNotificationsQuerySchema>) {
    return this.readModel.listNotifications(query);
  }

  async resendNotification(id: string) {
    return unwrapCandidateAdminResult(await this.candidateNotificationAdmin.resend(id));
  }

  async updateNotificationDocumentStructure(id: string) {
    const row = await this.readModel.getNotificationDocumentStructure(id);
    if (!row) {
      throw new NotFoundException("Notification not found", {
        errorCode: "PLATFORM_NOTIFICATION_NOT_FOUND",
      });
    }
    if (!row.documentUrl) {
      throw new ConflictException("Notification document is not available", {
        errorCode: "PLATFORM_NOTIFICATION_DOCUMENT_NOT_FOUND",
      });
    }
    if (row.type !== "summary_ready") {
      throw new ConflictException(
        "Document structure update is unavailable for this notification",
        { errorCode: "PLATFORM_NOTIFICATION_STRUCTURE_UNAVAILABLE" },
      );
    }
    if (!(row.providerId === "feishu" || row.providerId === "feishu-jiguang-hr")) {
      throw new BadRequestException("Unsupported Feishu provider", {
        errorCode: "PLATFORM_NOTIFICATION_PROVIDER_UNSUPPORTED",
      });
    }

    const documentId =
      row.documentId?.trim() ||
      (() => {
        try {
          const [kind, id] = new URL(row.documentUrl).pathname.split("/").filter(Boolean);
          return kind === "docx" ? id : undefined;
        } catch {
          return;
        }
      })();
    if (!documentId) {
      throw new ConflictException("Notification document id is unavailable", {
        errorCode: "PLATFORM_NOTIFICATION_DOCUMENT_NOT_FOUND",
      });
    }
    const result = await syncInterviewEvaluationDocument({
      accessToken: await this.feishuAccessToken(row.providerId),
      documentId,
      evaluation:
        row.resumeEvaluationArtifactMode === "qualitative" ? row.qualitativeResumeEvaluation : null,
      questions: row.interviewQuestions,
    });
    return { documentUrl: row.documentUrl, ...result };
  }

  async getNotificationPreview(id: string) {
    const row = await this.readModel.getNotificationPreview(id);
    if (!row) {
      throw new NotFoundException("Notification not found", {
        errorCode: "PLATFORM_NOTIFICATION_NOT_FOUND",
      });
    }
    if (row.type !== "summary_ready" || !row.conversationId || !row.transcript) {
      throw new ConflictException("Notification has no interview session available for preview", {
        errorCode: "PLATFORM_NOTIFICATION_PREVIEW_UNAVAILABLE",
      });
    }
    const prompt = `你是一位 HR 信息整理助手。只根据以下候选人面试对话，整理 jobMotivation、availability、overseasTravel、compensationExpectations、careerProgression、recentWork、projectHighlights 七个字段。没有证据的字段返回 null。只输出 JSON。\n\n${row.transcript.map((turn) => `${turn.role === "agent" ? "面试官" : "候选人"}：${turn.message}`).join("\n")}`;
    const apiKey = rawBackendEnvironment.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new BadRequestException("AI provider is not configured", {
        errorCode: "AI_PROVIDER_CONFIGURATION_MISSING",
      });
    }
    const endpoint = `${(rawBackendEnvironment.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/u, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        messages: [{ content: prompt, role: "user" }],
        model: rawBackendEnvironment.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new BadGatewayException(`AI provider returned HTTP ${response.status}`, {
        errorCode: "AI_PROVIDER_REQUEST_FAILED",
      });
    }
    const responseBody = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const evaluation = JSON.parse(responseBody.choices?.[0]?.message?.content || "{}") as Record<
      string,
      string | null
    >;
    const fields = [
      ["求职动机", "jobMotivation"],
      ["最快到岗时间", "availability"],
      ["海外出差情况", "overseasTravel"],
      ["薪酬预期沟通", "compensationExpectations"],
      ["加薪晋升情况", "careerProgression"],
      ["最近两份工作", "recentWork"],
      ["亮点项目", "projectHighlights"],
    ] as const;
    const children = [
      {
        block_type: 2,
        text: {
          elements: [{ text_run: { content: "HR面试评价", text_element_style: { bold: true } } }],
        },
      },
      ...fields.flatMap(([label, key], index) => [
        this.textBlock(`${index + 1}. ${label}：`),
        this.textBlock(evaluation[key]?.trim() || "未收集到"),
      ]),
    ];
    return {
      block: {
        block_type: 19,
        callout: { background_color: 2, border_color: 2, emoji_id: "books" },
        children,
      },
      prompt,
      title: `${row.candidateName} - HR面试评价预览`,
    };
  }

  async grantNotificationDocumentAccess(input: { id: string; userId: string }) {
    const row = await this.readModel.getNotificationDocumentAccess(input.id);
    if (!row) {
      throw new NotFoundException("Notification not found", {
        errorCode: "PLATFORM_NOTIFICATION_NOT_FOUND",
      });
    }
    if (!(row.documentId && row.documentUrl)) {
      throw new ConflictException("Notification document is not available", {
        errorCode: "PLATFORM_NOTIFICATION_DOCUMENT_NOT_FOUND",
      });
    }
    if (!(row.providerId === "feishu" || row.providerId === "feishu-jiguang-hr")) {
      throw new BadRequestException("Unsupported Feishu provider", {
        errorCode: "PLATFORM_NOTIFICATION_PROVIDER_UNSUPPORTED",
      });
    }
    const currentAccountOpenId = await this.readModel.getLatestProviderAccountOpenId(
      input.userId,
      row.providerId,
    );
    if (!currentAccountOpenId) {
      throw new ConflictException("Current administrator has no linked Feishu account", {
        errorCode: "PLATFORM_NOTIFICATION_FEISHU_ACCOUNT_MISSING",
      });
    }
    if (currentAccountOpenId !== row.recipientOpenId) {
      const accessToken = await this.feishuAccessToken(row.providerId);
      const response = await fetch(
        `https://open.feishu.cn/open-apis/drive/v1/permissions/${encodeURIComponent(row.documentId)}/members?type=docx`,
        {
          body: JSON.stringify({
            member_id: currentAccountOpenId,
            member_type: "openid",
            perm: "edit",
            type: "user",
          }),
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          method: "POST",
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        throw new BadGatewayException(
          `Feishu document permission returned HTTP ${response.status}`,
          { errorCode: "FEISHU_DOCUMENT_PERMISSION_FAILED" },
        );
      }
      const body = (await response.json()) as { code?: number; msg?: string };
      if (body.code) {
        throw new BadGatewayException(body.msg || "Feishu document permission failed", {
          errorCode: "FEISHU_DOCUMENT_PERMISSION_FAILED",
        });
      }
    }
    return { documentUrl: row.documentUrl };
  }

  async getLiveKitOverview() {
    const startedAt = performance.now();
    try {
      const rooms = await this.roomService().listRooms();
      return {
        endpoint: liveKitUrl(),
        latencyMs: Math.round(performance.now() - startedAt),
        metricsConfigured: Boolean(rawBackendEnvironment.LIVEKIT_PROMETHEUS_URL),
        status: "online",
        totals: {
          activeRecordings: rooms.filter((room) => room.activeRecording).length,
          participants: rooms.reduce((sum, room) => sum + room.numParticipants, 0),
          publishers: rooms.reduce((sum, room) => sum + room.numPublishers, 0),
          rooms: rooms.length,
        },
      };
    } catch (error) {
      return {
        endpoint: rawBackendEnvironment.LIVEKIT_URL ?? null,
        error: error instanceof Error ? error.message : "LiveKit unavailable",
        latencyMs: Math.round(performance.now() - startedAt),
        metricsConfigured: Boolean(rawBackendEnvironment.LIVEKIT_PROMETHEUS_URL),
        status: "offline",
        totals: { activeRecordings: 0, participants: 0, publishers: 0, rooms: 0 },
      };
    }
  }

  async listLiveKitRooms(query: z.infer<typeof platformLiveKitRoomsQuerySchema>) {
    try {
      const keyword = query.search?.trim().toLocaleLowerCase();
      const textFilters = parseListTextFilters(query.textFilters);
      const records = (await this.roomService().listRooms())
        .map(roomRecord)
        .filter((room) => matchesListTextFilters(textFilters, { name: room.name, sid: room.sid }))
        .filter(
          (room) =>
            !keyword ||
            room.name.toLocaleLowerCase().includes(keyword) ||
            room.sid.toLocaleLowerCase().includes(keyword),
        );
      return paginate(records, query.page, query.pageSize);
    } catch (error) {
      throw new BadGatewayException(
        error instanceof Error ? error.message : "LiveKit unavailable",
        { errorCode: "LIVEKIT_UPSTREAM_FAILED" },
      );
    }
  }

  async getLiveKitRoom(roomName: string) {
    try {
      const client = this.roomService();
      const [room] = await client.listRooms([roomName]);
      if (!room) {
        throw new NotFoundException("LiveKit room not found", {
          errorCode: "LIVEKIT_ROOM_NOT_FOUND",
        });
      }
      const participants = await client.listParticipants(roomName);
      return {
        metadata: room.metadata,
        participants: participants.map(participantRecord),
        room: roomRecord(room),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadGatewayException(
        error instanceof Error ? error.message : "LiveKit unavailable",
        { errorCode: "LIVEKIT_UPSTREAM_FAILED" },
      );
    }
  }

  async getLiveKitMetrics(query: z.infer<typeof platformLiveKitMetricsQuerySchema>) {
    const metricsUrl = rawBackendEnvironment.LIVEKIT_PROMETHEUS_URL?.trim();
    if (!metricsUrl) {
      return { configured: false, ...paginate([], query.page, query.pageSize) };
    }
    const response = await fetch(metricsUrl, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new BadGatewayException(`Prometheus returned HTTP ${response.status}`, {
        errorCode: "PROMETHEUS_UPSTREAM_FAILED",
      });
    }
    const keyword = query.search?.trim().toLocaleLowerCase();
    const textFilters = parseListTextFilters(query.textFilters);
    const records = parseMetrics(await response.text())
      .filter((metric) =>
        matchesListTextFilters(textFilters, { help: metric.help, name: metric.name }),
      )
      .filter(
        (metric) =>
          !keyword ||
          metric.name.toLocaleLowerCase().includes(keyword) ||
          metric.help?.toLocaleLowerCase().includes(keyword),
      );
    return { configured: true, ...paginate(records, query.page, query.pageSize) };
  }

  private roomService() {
    return new RoomServiceClient(
      liveKitUrl(),
      rawBackendEnvironment.LIVEKIT_API_KEY?.trim(),
      rawBackendEnvironment.LIVEKIT_API_SECRET?.trim(),
    );
  }

  private async feishuAccessToken(providerId: "feishu" | "feishu-jiguang-hr") {
    const secondary = providerId === "feishu-jiguang-hr";
    const appId = rawBackendEnvironment[secondary ? "FEISHU_APP_ID2" : "FEISHU_APP_ID"]?.trim();
    const appSecret =
      rawBackendEnvironment[secondary ? "FEISHU_APP_SECRET2" : "FEISHU_APP_SECRET"]?.trim();
    if (!(appId && appSecret)) {
      throw new BadRequestException("Feishu application is not configured", {
        errorCode: "FEISHU_CONFIGURATION_MISSING",
      });
    }
    const response = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body = (await response.json()) as {
      code?: number;
      msg?: string;
      tenant_access_token?: string;
    };
    if (!response.ok || body.code || !body.tenant_access_token) {
      throw new BadGatewayException(body.msg || "Feishu authentication failed", {
        errorCode: "FEISHU_AUTHENTICATION_FAILED",
      });
    }
    return body.tenant_access_token;
  }

  private textBlock(content: string) {
    return { block_type: 2, text: { elements: [{ text_run: { content } }] } };
  }
}
