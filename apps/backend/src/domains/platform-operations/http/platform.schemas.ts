import { z } from "zod";
import { attachmentParseStatusValues, attachmentTextSourceValues } from "@arc/db-schema/db-enums";
import { listTextFiltersSchema } from "@arc/shared/list-text-filters";

export const platformIdentifierSchema = z.string().trim().min(1);

const pageSchema = z.coerce.number().int().min(1).default(1);
const tenPerPageSchema = z.coerce.number().int().min(1).max(100).default(10);
const twentyPerPageSchema = z.coerce.number().int().min(1).max(100).default(20);
const sortOrderSchema = z.enum(["asc", "desc"]);
const resumeParseStatusValues = ["unparsed", "queued", "processing", "ready", "failed"] as const;
const resumeParseJobListStates = [
  "all",
  "active",
  "waiting",
  "delayed",
  "completed",
  "failed",
  "paused",
  "prioritized",
  "waiting-children",
] as const;

export const platformOrganizationQuerySchema = z.object({
  page: pageSchema,
  pageSize: tenPerPageSchema,
  search: z.string().optional(),
  sortBy: z.enum(["name", "slug", "createdAt", "memberCount"]).default("createdAt"),
  sortOrder: sortOrderSchema.default("desc"),
  textFilters: listTextFiltersSchema("organizations"),
});

export const platformOrganizationMembersQuerySchema = z.object({
  page: pageSchema,
  pageSize: tenPerPageSchema,
});

export const platformUsersQuerySchema = z.object({
  page: pageSchema,
  pageSize: tenPerPageSchema,
  search: z.string().optional(),
  sortBy: z.enum(["name", "email", "role", "createdAt", "lastActiveAt"]).default("lastActiveAt"),
  sortOrder: sortOrderSchema.default("desc"),
  textFilters: listTextFiltersSchema("users"),
});

export const platformUserRemarkSchema = z.object({
  remark: z.string().max(80).nullable(),
});

const nonEmptyStringSchema = z.string().trim().min(1);
const mailIngestAccountSchema = z.object({
  emailAddress: nonEmptyStringSchema.email(),
  enabled: z.boolean().default(true),
  failedMailbox: nonEmptyStringSchema.default("ARC-Failed"),
  imapHost: nonEmptyStringSchema.default("imap.qiye.aliyun.com"),
  imapPort: z.number().int().min(1).max(65_535).default(993),
  imapSecure: z.boolean().default(true),
  listenStartAt: z.string().datetime().nullable().optional(),
  mailbox: nonEmptyStringSchema.default("INBOX"),
  password: nonEmptyStringSchema,
  processedMailbox: nonEmptyStringSchema.default("ARC-Processed"),
  subjectKeyword: nonEmptyStringSchema.default("boss直聘"),
  username: nonEmptyStringSchema,
});

export const platformMailAccountsQuerySchema = z.object({
  page: pageSchema,
  pageSize: tenPerPageSchema,
  search: z.string().optional(),
  sortBy: z.enum(["userName", "userEmail", "emailAddress", "lastCheckedAt"]).default("userName"),
  sortOrder: sortOrderSchema.default("asc"),
  textFilters: listTextFiltersSchema("platformMailAccounts"),
});

export const platformCreateMailAccountSchema = mailIngestAccountSchema.extend({
  organizationId: nonEmptyStringSchema,
  userId: nonEmptyStringSchema,
});

export const platformUpdateMailAccountSchema = mailIngestAccountSchema
  .omit({ password: true })
  .partial()
  .extend({
    organizationId: nonEmptyStringSchema,
    password: nonEmptyStringSchema.optional(),
  });

export const platformQueueJobsQuerySchema = z.object({
  page: pageSchema,
  pageSize: twentyPerPageSchema,
  parseStatus: z.enum(["all", ...resumeParseStatusValues]).default("all"),
  search: z.string().optional(),
  state: z.enum(resumeParseJobListStates).default("all"),
  uploadStatus: z
    .enum(["all", "pending", "processing", "succeeded", "failed", "duplicate_skipped", "cancelled"])
    .default("all"),
});

export const platformResumeParseCacheQuerySchema = z.object({
  cacheType: z.enum(["all", "structured", "text_only"]).default("all"),
  page: pageSchema,
  pageSize: tenPerPageSchema,
  parsedStatus: z.enum(["all", ...attachmentParseStatusValues]).default("all"),
  search: z.string().optional(),
  sortBy: z.enum(["filename", "size", "parsedAt", "createdAt", "parsedStatus"]).default("parsedAt"),
  sortOrder: sortOrderSchema.default("desc"),
  textFilters: listTextFiltersSchema("parseCache"),
  textSource: z.enum(["all", ...attachmentTextSourceValues]).default("all"),
});

export const platformNotificationsQuerySchema = z.object({
  page: pageSchema,
  pageSize: twentyPerPageSchema,
  providerId: z.enum(["all", "feishu", "feishu-jiguang-hr"]).default("all"),
  search: z.string().optional(),
  sortBy: z
    .enum([
      "createdAt",
      "sentAt",
      "updatedAt",
      "status",
      "providerId",
      "candidateName",
      "organizationName",
    ])
    .default("createdAt"),
  sortOrder: sortOrderSchema.default("desc"),
  status: z.enum(["all", "pending", "sent", "failed"]).default("all"),
  textFilters: listTextFiltersSchema("notifications"),
});

export const platformLiveKitListQuerySchema = z.object({
  page: pageSchema,
  pageSize: twentyPerPageSchema,
  search: z.string().optional(),
});

export const platformLiveKitRoomsQuerySchema = platformLiveKitListQuerySchema.extend({
  textFilters: listTextFiltersSchema("rooms"),
});

export const platformLiveKitMetricsQuerySchema = platformLiveKitListQuerySchema.extend({
  textFilters: listTextFiltersSchema("metrics"),
});

const nullableStringSchema = z.string().nullable();
const paginationFields = {
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
};

const platformOrganizationRecordSchema = z.object({
  createdAt: z.string(),
  id: z.string(),
  memberCount: z.number(),
  name: z.string(),
  slug: z.string(),
});

export const platformOrganizationsResponseSchema = z.object({
  ...paginationFields,
  records: z.array(platformOrganizationRecordSchema),
});

export const platformOrganizationResponseSchema = z.object({
  members: z.object({
    ...paginationFields,
    records: z.array(
      z.object({
        createdAt: z.string(),
        id: z.string(),
        role: z.string(),
        userEmail: z.string(),
        userId: z.string(),
        userImage: nullableStringSchema,
        userName: z.string(),
      }),
    ),
  }),
  organization: z.looseObject({
    createdAt: z.string(),
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
});

const platformUserRecordSchema = z.looseObject({
  createdAt: z.string(),
  email: z.string(),
  id: z.string(),
  lastActiveAt: nullableStringSchema,
  name: z.string(),
  role: nullableStringSchema,
  updatedAt: z.string(),
});

export const platformUsersResponseSchema = z.object({
  ...paginationFields,
  records: z.array(platformUserRecordSchema),
});

export const platformUserRemarkResponseSchema = z.object({
  id: z.string(),
  remark: nullableStringSchema,
  updatedAt: z.string(),
});

export const platformUserWorkspacesResponseSchema = z.object({
  records: z.array(
    z.looseObject({
      id: z.string(),
      organizationId: z.string(),
      organizationName: z.string(),
      organizationSlug: z.string(),
      role: z.string(),
    }),
  ),
  total: z.number(),
  user: z.object({
    email: z.string(),
    id: z.string(),
    image: nullableStringSchema,
    name: z.string(),
  }),
});

const platformMailAccountResponseSchema = z.looseObject({
  createdAt: z.string(),
  emailAddress: z.string(),
  enabled: z.boolean(),
  id: z.string(),
  imapHost: z.string(),
  username: z.string(),
});

export const platformMailAccountsResponseSchema = z.object({
  ...paginationFields,
  records: z.array(
    z.looseObject({
      account: platformMailAccountResponseSchema.nullable(),
      organization: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
      user: z.looseObject({ email: z.string(), id: z.string(), name: z.string() }),
    }),
  ),
});

export const platformMailAccountMutationResponseSchema = platformMailAccountResponseSchema;

const platformQueueRecordSchema = z.looseObject({
  counts: z.record(z.string(), z.number()),
  displayName: z.string(),
  name: z.string(),
  workersCount: z.number(),
});

export const platformQueuesResponseSchema = z.object({
  records: z.array(platformQueueRecordSchema),
  total: z.number(),
});

export const platformQueueJobsResponseSchema = z.looseObject({
  page: z.number(),
  pageSize: z.number(),
  records: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      state: z.string(),
    }),
  ),
  total: z.number(),
  totalPages: z.number(),
});

const platformResumeParseCacheRecordSchema = z.looseObject({
  contentHash: z.string(),
  filename: z.string(),
  parsedStatus: z.string(),
  size: z.number(),
});

export const platformResumeParseCacheResponseSchema = z.object({
  ...paginationFields,
  records: z.array(platformResumeParseCacheRecordSchema),
});

export const platformResumeParseCacheEntryResponseSchema = platformResumeParseCacheRecordSchema;
export const platformResumeParseCacheDeleteResponseSchema = z.object({ clearedCount: z.number() });

const platformNotificationRecordSchema = z.looseObject({
  candidateName: z.string(),
  createdAt: z.string(),
  id: z.string(),
  providerId: z.string(),
  status: z.string(),
  type: z.string(),
});

export const platformNotificationsResponseSchema = z.object({
  ...paginationFields,
  records: z.array(platformNotificationRecordSchema),
});

export const platformNotificationResendResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
});

export const platformNotificationStructureResponseSchema = z.looseObject({
  documentUrl: z.string(),
  insertedSections: z.array(z.string()),
  updatedSections: z.array(z.string()),
});

export const platformNotificationPreviewResponseSchema = z.object({
  block: z.json(),
  prompt: z.string(),
  title: z.string(),
});

export const platformNotificationDocumentAccessResponseSchema = z.object({
  documentUrl: z.string(),
});

const liveKitRoomRecordSchema = z.looseObject({
  activeRecording: z.boolean(),
  createdAt: nullableStringSchema,
  name: z.string(),
  numParticipants: z.number(),
  numPublishers: z.number(),
  sid: z.string(),
});

export const platformLiveKitOverviewResponseSchema = z.looseObject({
  endpoint: nullableStringSchema,
  latencyMs: z.number(),
  metricsConfigured: z.boolean(),
  status: z.enum(["online", "offline"]),
  totals: z.object({
    activeRecordings: z.number(),
    participants: z.number(),
    publishers: z.number(),
    rooms: z.number(),
  }),
});

export const platformLiveKitRoomsResponseSchema = z.object({
  ...paginationFields,
  records: z.array(liveKitRoomRecordSchema),
});

export const platformLiveKitRoomResponseSchema = z.object({
  metadata: z.string(),
  participants: z.array(
    z.looseObject({
      identity: z.string(),
      name: z.string(),
      sid: z.string(),
      state: z.string(),
    }),
  ),
  room: liveKitRoomRecordSchema,
});

export const platformLiveKitMetricsResponseSchema = z.object({
  ...paginationFields,
  configured: z.boolean(),
  records: z.array(
    z.object({
      help: nullableStringSchema,
      labels: z.record(z.string(), z.string()),
      name: z.string(),
      type: nullableStringSchema,
      value: z.union([z.number(), z.string()]),
    }),
  ),
});
