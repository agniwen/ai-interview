import {
  STUDIO_PAGE_PERMISSION_ACTIONS,
  STUDIO_PAGE_PERMISSION_LABELS,
  statement,
} from "@arc/shared/permissions";
import { z } from "zod";

export type PermissionResource = keyof typeof statement;
export type PermissionAction<R extends PermissionResource = PermissionResource> =
  (typeof statement)[R][number];
export type PermissionRecord = Record<string, string[]>;

type PermissionActionLabels = Record<string, string>;

type PermissionDescriptions = Record<string, string | undefined>;

type ResourceActionDescriptions = Record<string, PermissionDescriptions | undefined>;

type LegacyPermissionReplacements = Record<string, string[] | undefined>;
interface DynamicWorkspaceRoleOrderKey {
  createdAt?: Date | string | null;
  id?: string;
  role?: string;
}

export const BUILT_IN_WORKSPACE_ROLE_NAMES = new Set([
  "owner",
  "admin",
  "member",
  "noAccess",
  "noaccess",
]);
export const ROLE_ASSIGNED_TO_MEMBERS_MESSAGE =
  "该角色下仍有成员，不能删除。请先将这些成员调整到其他角色。";

export const WORKSPACE_PERMISSION_GROUPS = [
  {
    description: "控制左侧导航页面是否可见。",
    resources: [
      {
        actions: STUDIO_PAGE_PERMISSION_ACTIONS,
        key: "page",
        label: "页面浏览",
      },
    ],
    title: "页面浏览",
  },
  {
    description: "工作区基础资料、成员和邀请。",
    resources: [
      {
        actions: ["update"] as const,
        key: "organization",
        label: "工作区设置",
      },
      {
        actions: ["create", "update", "delete"] as const,
        key: "member",
        label: "成员管理",
      },
      {
        actions: ["create", "cancel"] as const,
        key: "invitation",
        label: "成员邀请",
      },
    ],
    title: "工作区管理",
  },
  {
    description: "招聘主流程和候选人资料。",
    resources: [
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "resumeLibrary",
        label: "招聘台",
      },
      {
        actions: ["create", "read", "publish", "import", "delete"] as const,
        key: "resumePool",
        label: "人才库",
      },
      {
        actions: ["create", "read", "process", "cancel", "delete"] as const,
        key: "resumeUploadBatch",
        label: "上传批次",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "interview",
        label: "AI 面试",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "humanInterview",
        label: "真人面试管理",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "offer",
        label: "Offer 管理",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "jd",
        label: "在招岗位",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "chat",
        label: "聊天助手",
      },
    ],
    title: "招聘流程",
  },
  {
    description: "组织结构、AI面试官和题库配置。",
    resources: [
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "department",
        label: "部门",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "interviewer",
        label: "AI面试官",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "candidateForm",
        label: "表单题",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "questionTemplate",
        label: "沟通题",
      },
    ],
    title: "招聘配置",
  },
  {
    description: "系统级配置和审计数据。",
    resources: [
      {
        actions: ["read", "update"] as const,
        key: "globalConfig",
        label: "上下文设置",
      },
      {
        actions: ["read"] as const,
        key: "auditLog",
        label: "审计日志",
      },
      {
        actions: ["create", "read", "update", "delete", "manage"] as const,
        key: "mailIngestAccount",
        label: "邮箱监听",
      },
    ],
    title: "系统能力",
  },
] as const satisfies readonly {
  title: string;
  description: string;
  resources: readonly {
    key: PermissionResource;
    label: string;
    actions: readonly PermissionAction[];
  }[];
}[];

export const PERMISSION_ACTION_LABELS = {
  ...STUDIO_PAGE_PERMISSION_LABELS,
  cancel: "取消",
  create: "新增",
  delete: "删除",
  import: "导入",
  manage: "代管",
  process: "处理",
  publish: "发布",
  read: "查看",
  update: "编辑",
} satisfies PermissionActionLabels;

const PERMISSION_ITEM_ACTION_LABELS = {
  "resumePool:create": "上传",
} satisfies PermissionActionLabels;

const PAGE_PERMISSION_DESCRIPTIONS = {
  dashboard: "控制是否能在侧边栏看到并访问「数据看板」页面；未勾选时直接访问会进入 404。",
  departments:
    "控制是否能在侧边栏看到并访问「部门管理」页面；页面内部门列表、详情和增删改仍受「部门」相关权限控制。",
  forms:
    "控制是否能在侧边栏看到并访问「表单题」页面；页面内列表、AI 生成、版本和增删改仍受「表单题」相关权限控制。",
  globalConfig:
    "控制是否能在侧边栏看到并访问「上下文设置」页面；读取和保存上下文配置仍受「上下文设置」查看/编辑权限控制。",
  interviewQuestions:
    "控制是否能在侧边栏看到并访问「沟通题」页面；题库列表、版本和增删改仍受「沟通题」相关权限控制。",
  interviewers:
    "控制是否能在侧边栏看到并访问「AI面试官管理」页面；AI面试官列表、详情和增删改仍受「AI面试官」相关权限控制。",
  interviews:
    "控制是否能在侧边栏看到并访问「AI 面试」页面；列表、详情、报告、录音、轮次和操作仍受「AI 面试」相关权限控制。",
  jobDescriptions:
    "控制是否能在侧边栏看到并访问「岗位设置」页面；岗位列表、详情和增删改仍受「在招岗位」相关权限控制，推荐候选人还需要「招聘台」查看权限。",
  mailIngestAccounts:
    "控制是否能在侧边栏看到并访问「邮箱监听」页面；邮箱解析入库到人才库的后续查看/导入仍受「招聘台」相关权限控制。",
  me: "控制是否能访问「个人中心」页面；页面里的工作区成员资料调整仍受「成员管理」相关权限控制。",
  members:
    "控制是否能在侧边栏看到并访问「工作区管理」页面；成员角色、招聘组、邀请链接和工作区设置仍分别受成员、邀请和工作区设置权限控制。",
  permissions:
    "控制是否能在侧边栏看到并访问「权限管理」页面；实际修改角色权限仅工作区拥有者和管理员可执行。",
  resumePool:
    "控制是否能在侧边栏看到并访问「人才库」页面；未勾选时直接访问会进入 404。页面内数据接口仍受「人才库」业务权限控制。",
  resumes:
    "控制是否能在侧边栏看到并访问「招聘台」页面；未勾选时直接访问会进入 404。招聘台数据接口仍受「招聘台」业务权限控制，上传批次有独立权限。",
} satisfies PermissionDescriptions;

const RESOURCE_ACTION_DESCRIPTIONS = {
  auditLog: {
    read: "允许查看工作区审计日志。当前主要作为系统能力预留，具体入口会按该权限控制。",
  },
  candidateForm: {
    create: "允许在「表单题」页面创建表单题。",
    delete: "允许删除表单题。",
    read: "允许加载「表单题」列表、详情、版本详情，以及表单 AI 生成所需的读取接口。",
    update: "允许编辑、归档/恢复表单题，并使用表单 AI 生成或更新表单内容。",
  },
  chat: {
    create: "允许发起聊天助手相关创建流程；当前权限矩阵预留给聊天会话创建能力。",
    delete: "允许删除聊天助手相关数据；当前权限矩阵预留给聊天会话删除能力。",
    read: "允许查看聊天助手相关数据；当前权限矩阵预留给聊天会话读取能力。",
    update: "允许更新聊天助手相关数据；当前权限矩阵预留给聊天会话编辑能力。",
  },
  department: {
    create: "允许在「部门管理」页面新增部门。",
    delete: "允许删除部门。",
    read: "允许加载「部门管理」页面的部门列表、全部部门选项和部门详情。",
    update: "允许编辑部门名称、描述等资料。",
  },
  globalConfig: {
    read: "允许加载「上下文设置」里的全局配置。",
    update: "允许保存「上下文设置」里的公司信息、面试话术等上下文配置。",
  },
  humanInterview: {
    create: "允许将候选人推进到真人复面，并创建真人复面轮次或视频会议。",
    delete: "允许取消真人复面轮次，或删除尚未开始的真人复面会议。",
    read: "允许查看真人复面阶段页签、轮次、会议和入场链接。",
    update: "允许调整真人复面时间、结束会议、标记完成并录入面试评价。",
  },
  interview: {
    create: "允许在「AI 面试」页面创建面试记录或从候选人流程发起新的 AI 面试。",
    delete: "允许删除 AI 面试记录及相关轮次数据。",
    read: "允许加载「AI 面试」列表、统计、详情、报告、录音、简历预览、表单提交、题目绑定、人面轮次和 offer 草稿等数据。",
    update: "允许编辑 AI 面试、轮次、题目绑定、邮件、重置、面试结果、人面安排和 offer 草稿等操作。",
  },
  interviewer: {
    create: "允许在「AI面试官管理」页面新增 AI面试官。",
    delete: "允许删除 AI面试官。",
    read: "允许加载 AI面试官列表、全部 AI面试官选项和详情；相关选择器也依赖该权限。",
    update: "允许编辑 AI面试官资料和可用性等配置。",
  },
  invitation: {
    cancel: "允许取消尚未接受的成员邀请。",
    create: "允许在「工作区管理」中创建邀请链接或成员邀请记录。",
  },
  jd: {
    create: "允许在「岗位设置」页面新增岗位。",
    delete: "允许删除在招岗位。",
    read: "允许加载岗位列表、全部岗位选项、岗位详情、岗位编码生成和推荐链接；推荐候选人接口还同时需要「招聘台」查看权限。",
    update: "允许编辑岗位描述、招聘要求、关联配置和发布状态。",
  },
  mailIngestAccount: {
    create: "允许在「邮箱监听」页面新增监听邮箱账号。",
    delete: "允许删除监听邮箱账号。",
    manage:
      "允许查看和管理工作区内所有成员的监听邮箱账号；没有该权限时只能按接口限制访问自己的账号。",
    read: "允许加载邮箱监听账号列表和详情。",
    update: "允许编辑监听邮箱账号配置。",
  },
  member: {
    create: "允许新增工作区成员，或处理会创建成员的加入流程。",
    delete: "允许从工作区移除成员。",
    update:
      "允许调整成员角色，并管理招聘组、组成员、组内角色和成员所属组；实际可调整范围仍受服务端角色规则限制。",
  },
  offer: {
    create: "允许将候选人推进到 Offer，并创建 Offer 草稿。",
    delete: "允许撤回已创建或已发送的 Offer。",
    read: "允许查看 Offer 阶段页签和 Offer 版本记录。",
    update: "允许编辑 Offer 草稿、发送 Offer，并记录候选人响应。",
  },
  organization: {
    update: "允许修改工作区基础设置，例如工作区名称；不包含成员、角色和邀请管理。",
  },
  questionTemplate: {
    create: "允许在「沟通题」页面新增沟通题。",
    delete: "允许删除沟通题。",
    read: "允许加载沟通题列表、全部模板选项、模板详情、版本详情和沟通题相关选择器。",
    update: "允许编辑、归档/恢复沟通题和模板版本内容。",
  },
  resumeLibrary: {
    create: "允许上传或创建「招聘台」候选人记录；从人才库导入招聘台也需要该权限。",
    delete: "允许删除和批量删除「招聘台」候选人记录。",
    read: "允许加载「招聘台」列表、详情、时间线、AI 面试轮次、简历文件/预览、技能建议和去重检查；在招岗位里的推荐候选人接口也需要该权限。",
    update: "允许编辑「招聘台」候选人资料、替换/解析简历，并从招聘台发起 AI 面试。",
  },
  resumePool: {
    create: "允许在「人才库」上传私有或工作区共享简历。",
    delete: "允许删除自己在「人才库」中的私有记录。",
    import: "允许从「人才库」发起导入；真正写入招聘台还同时需要「招聘台」新增权限。",
    publish: "允许把自己的私有简历发布到本工作区共享的「人才库」。",
    read: "允许加载「人才库」列表、详情、简历文件和预览。",
  },
  resumeUploadBatch: {
    cancel: "允许取消正在处理或暂停中的上传批次。",
    create: "允许创建批量上传批次并上传待处理文件。",
    delete: "允许删除上传批次记录。",
    process: "允许继续处理、恢复或推进上传批次中的文件。",
    read: "允许查看上传批次列表、活跃批次和批次详情。",
  },
} satisfies ResourceActionDescriptions;

const optionalStringSchema = z.string().optional();
const stringArraySchema = z.array(z.string());

function readStringProperty<const T extends object>(record: T, key: string) {
  const entry = Object.entries(record).find(([candidate]) => candidate === key);
  const parsed = optionalStringSchema.safeParse(entry?.[1]);
  return parsed.success ? parsed.data : undefined;
}

function readDescriptionProperty<const T extends object>(record: T, key: string) {
  const entry = Object.entries(record).find(([candidate]) => candidate === key);
  const parsed = z.record(z.string(), z.string()).safeParse(entry?.[1]);
  return parsed.success ? parsed.data : undefined;
}

function readStringArrayProperty<const T extends object>(record: T, key: string) {
  const entry = Object.entries(record).find(([candidate]) => candidate === key);
  const parsed = stringArraySchema.safeParse(entry?.[1]);
  return parsed.success ? parsed.data : undefined;
}

function getPermissionItemDescription({
  action,
  actionLabel,
  resource,
  resourceLabel,
}: {
  action: string;
  actionLabel: string;
  resource: PermissionResource;
  resourceLabel: string;
}) {
  if (resource === "page") {
    const description =
      readStringProperty(PAGE_PERMISSION_DESCRIPTIONS, action) ??
      `控制该角色是否能在侧边栏看到并访问「${actionLabel}」页面；页面内数据和操作仍受对应业务权限控制。`;
    return description.includes("404") ? description : `${description}未勾选时直接访问会进入 404。`;
  }

  const directDescription = readDescriptionProperty(RESOURCE_ACTION_DESCRIPTIONS, resource)?.[
    action
  ];
  if (directDescription) {
    return directDescription;
  }

  if (action === "read") {
    return `允许查看「${resourceLabel}」的列表、详情和相关接口数据；没有该权限时，即使能进入页面也无法加载对应数据。`;
  }

  if (action === "create") {
    return `允许在「${resourceLabel}」相关页面新增数据或发起创建流程。`;
  }

  if (action === "update") {
    return `允许编辑「${resourceLabel}」相关数据和配置。`;
  }

  if (action === "delete") {
    return `允许删除「${resourceLabel}」相关数据。`;
  }

  return `控制「${resourceLabel}」的「${actionLabel}」能力。`;
}

export interface PermissionItem {
  action: string;
  actionLabel: string;
  description: string;
  groupTitle: string;
  key: string;
  label: string;
  resource: PermissionResource;
  resourceLabel: string;
}

export interface PermissionHeaderGroup {
  items: PermissionItem[];
  resource: PermissionResource;
  resourceLabel: string;
}

export function buildPermissionItems(): PermissionItem[] {
  return WORKSPACE_PERMISSION_GROUPS.flatMap((group) =>
    group.resources.flatMap((resource) =>
      resource.actions.map((action) => {
        const key = `${resource.key}:${action}`;
        const actionLabel =
          readStringProperty(PERMISSION_ITEM_ACTION_LABELS, key) ??
          readStringProperty(PERMISSION_ACTION_LABELS, action) ??
          action;
        return {
          action,
          actionLabel,
          description: getPermissionItemDescription({
            action,
            actionLabel,
            resource: resource.key,
            resourceLabel: resource.label,
          }),
          groupTitle: group.title,
          key,
          label: `${resource.label} · ${actionLabel}`,
          resource: resource.key,
          resourceLabel: resource.label,
        };
      }),
    ),
  );
}

export function buildPermissionHeaderGroups(items: PermissionItem[]): PermissionHeaderGroup[] {
  const groups: PermissionHeaderGroup[] = [];
  for (const item of items) {
    const lastGroup = groups.at(-1);
    if (lastGroup?.resource === item.resource) {
      lastGroup.items.push(item);
      continue;
    }
    groups.push({
      items: [item],
      resource: item.resource,
      resourceLabel: item.resourceLabel,
    });
  }
  return groups;
}

const LEGACY_MANAGE_PERMISSION_REPLACEMENTS = {
  humanInterview: ["create", "read", "update", "delete"],
  offer: ["create", "read", "update", "delete"],
} satisfies LegacyPermissionReplacements;

function normalizeLegacyPermissionActions(
  resource: PermissionResource,
  actions: readonly string[] | undefined,
): string[] {
  const replacement = readStringArrayProperty(LEGACY_MANAGE_PERMISSION_REPLACEMENTS, resource);
  if (!replacement || !actions?.includes("manage")) {
    return actions ? [...new Set(actions)] : [];
  }
  return [...new Set([...actions.filter((action) => action !== "manage"), ...replacement])];
}

function isPermissionResource(value: string): value is PermissionResource {
  return Object.hasOwn(statement, value);
}

export function copyPermissionRecord(permission: PermissionRecord | null | undefined) {
  const copy: PermissionRecord = {};
  for (const [resource, actions] of Object.entries(permission ?? {})) {
    if (isPermissionResource(resource)) {
      copy[resource] = normalizeLegacyPermissionActions(resource, actions);
    }
  }
  return copy;
}

const errorDetailsSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

type ErrorDetails = z.infer<typeof errorDetailsSchema>;

export function canManageWorkspacePermissions(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

function readUnknownErrorMessage(error: ErrorDetails | null): string | undefined {
  return error?.message;
}

function readUnknownErrorCode(error: ErrorDetails | null): string | undefined {
  return error?.code;
}

export function readRoleDeleteError<const T>(error: T): string {
  const parsed = errorDetailsSchema.safeParse(error);
  const parsedError = parsed.success ? parsed.data : null;
  const message = readUnknownErrorMessage(parsedError);
  if (
    readUnknownErrorCode(parsedError) === "ROLE_IS_ASSIGNED_TO_MEMBERS" ||
    message?.includes("Cannot delete a role that is assigned to members")
  ) {
    return ROLE_ASSIGNED_TO_MEMBERS_MESSAGE;
  }
  return message ?? "删除角色失败";
}

function readCreatedAtTime(value: Date | string | null | undefined): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

export function sortDynamicWorkspaceRolesByCreatedAt<T extends DynamicWorkspaceRoleOrderKey>(
  roles: readonly T[],
): T[] {
  return [...roles].toSorted((left, right) => {
    const byCreatedAt = readCreatedAtTime(left.createdAt) - readCreatedAtTime(right.createdAt);
    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }
    return (left.id ?? left.role ?? "").localeCompare(right.id ?? right.role ?? "");
  });
}

export function normalizeDynamicRoleName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
}

export function getPermissionActions(
  permission: PermissionRecord | null | undefined,
  resource: PermissionResource,
): string[] {
  return permission?.[resource] ?? [];
}

export function hasPermissionAction(
  permission: PermissionRecord | null | undefined,
  resource: PermissionResource,
  action: string,
): boolean {
  return getPermissionActions(permission, resource).includes(action);
}

export function togglePermissionAction(
  permission: PermissionRecord,
  resource: PermissionResource,
  action: string,
) {
  const current = new Set(getPermissionActions(permission, resource));
  if (current.has(action)) {
    current.delete(action);
  } else {
    current.add(action);
  }
  const next = { ...permission };
  if (current.size === 0) {
    Reflect.deleteProperty(next, resource);
    return next;
  }
  next[resource] = [...current];
  return next;
}
