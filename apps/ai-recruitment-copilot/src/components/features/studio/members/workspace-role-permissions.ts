import {
  STUDIO_PAGE_PERMISSION_ACTIONS,
  STUDIO_PAGE_PERMISSION_LABELS,
} from "@arc/shared/permissions";
import type { statement } from "@arc/shared/permissions";

export type PermissionResource = keyof typeof statement;
export type PermissionAction<R extends PermissionResource = PermissionResource> =
  (typeof statement)[R][number];
export type PermissionRecord = Partial<Record<PermissionResource, string[]>>;

export const BUILT_IN_WORKSPACE_ROLE_NAMES = new Set(["owner", "admin", "member"]);
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
        label: "简历库",
      },
      {
        actions: ["create", "read", "publish", "import", "delete"] as const,
        key: "resumePool",
        label: "简历广场",
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
    description: "组织结构、面试官和题库配置。",
    resources: [
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "department",
        label: "部门",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "interviewer",
        label: "面试官",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "candidateForm",
        label: "候选人表单",
      },
      {
        actions: ["create", "read", "update", "delete"] as const,
        key: "questionTemplate",
        label: "面试题模板",
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
        label: "系统设置",
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

export const PERMISSION_ACTION_LABELS: Record<string, string> = {
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
};

const PERMISSION_ITEM_ACTION_LABELS: Record<string, string> = {
  "resumePool:create": "上传",
};

const PAGE_PERMISSION_DESCRIPTIONS: Partial<Record<string, string>> = {
  dashboard: "控制是否能在侧边栏看到并访问「数据看板」页面；未勾选时直接访问会进入 404。",
  departments:
    "控制是否能在侧边栏看到并访问「部门管理」页面；页面内部门列表、详情和增删改仍受「部门」相关权限控制。",
  forms:
    "控制是否能在侧边栏看到并访问「面试表单」页面；页面内表单列表、AI 生成、版本和增删改仍受「候选人表单」相关权限控制。",
  globalConfig:
    "控制是否能在侧边栏看到并访问「系统设置」页面；读取和保存系统配置仍受「系统设置」查看/编辑权限控制。",
  interviewQuestions:
    "控制是否能在侧边栏看到并访问「面试题」页面；题库列表、版本和增删改仍受「面试题模板」相关权限控制。",
  interviewers:
    "控制是否能在侧边栏看到并访问「面试官管理」页面；面试官列表、详情和增删改仍受「面试官」相关权限控制。",
  interviews:
    "控制是否能在侧边栏看到并访问「AI 面试」页面；列表、详情、报告、录音、轮次和操作仍受「AI 面试」相关权限控制。",
  jobDescriptions:
    "控制是否能在侧边栏看到并访问「在招岗位管理」页面；岗位列表、详情和增删改仍受「在招岗位」相关权限控制，推荐候选人还需要「简历库」查看权限。",
  mailIngestAccounts:
    "控制是否能在侧边栏看到并访问「邮箱监听」页面；邮箱解析入库到简历广场的后续查看/导入仍受「简历库」相关权限控制。",
  me: "控制是否能访问「我的信息」页面；页面里的工作区成员资料调整仍受「成员管理」相关权限控制。",
  members:
    "控制是否能在侧边栏看到并访问「工作区管理」页面；成员角色、招聘组、邀请链接和工作区设置仍分别受成员、邀请和工作区设置权限控制。",
  permissions:
    "控制是否能在侧边栏看到并访问「权限管理」页面；实际修改角色权限仅工作区拥有者和管理员可执行。",
  resumePool:
    "控制是否能在侧边栏看到并访问「简历广场」页面；未勾选时直接访问会进入 404。页面内数据接口仍受「简历广场」业务权限控制。",
  resumes:
    "控制是否能在侧边栏看到并访问「简历库」页面；未勾选时直接访问会进入 404。简历库数据接口仍受「简历库」业务权限控制，上传批次有独立权限。",
};

const RESOURCE_ACTION_DESCRIPTIONS: Partial<Record<PermissionResource, Record<string, string>>> = {
  auditLog: {
    read: "允许查看工作区审计日志。当前主要作为系统能力预留，具体入口会按该权限控制。",
  },
  candidateForm: {
    create: "允许在「面试表单」页面新建候选人表单。",
    delete: "允许删除候选人表单。",
    read: "允许加载「面试表单」列表、详情、版本详情，以及表单 AI 生成所需的读取接口。",
    update: "允许编辑、归档/恢复候选人表单，并使用表单 AI 生成或更新表单内容。",
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
    read: "允许加载「系统设置」里的全局配置。",
    update: "允许保存「系统设置」里的公司信息、面试配置等全局配置。",
  },
  interview: {
    create: "允许在「AI 面试」页面创建面试记录或从候选人流程发起新的 AI 面试。",
    delete: "允许删除 AI 面试记录及相关轮次数据。",
    read: "允许加载「AI 面试」列表、统计、详情、报告、录音、简历预览、表单提交、题目绑定、人面轮次和 offer 草稿等数据。",
    update: "允许编辑 AI 面试、轮次、题目绑定、邮件、重置、面试结果、人面安排和 offer 草稿等操作。",
  },
  interviewer: {
    create: "允许在「面试官管理」页面新增面试官。",
    delete: "允许删除面试官。",
    read: "允许加载面试官列表、全部面试官选项和面试官详情；相关选择器也依赖该权限。",
    update: "允许编辑面试官资料和可用性等配置。",
  },
  invitation: {
    cancel: "允许取消尚未接受的成员邀请。",
    create: "允许在「工作区管理」中创建邀请链接或成员邀请记录。",
  },
  jd: {
    create: "允许在「在招岗位管理」页面新增岗位。",
    delete: "允许删除在招岗位。",
    read: "允许加载岗位列表、全部岗位选项、岗位详情、岗位编码生成和推荐链接；推荐候选人接口还同时需要「简历库」查看权限。",
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
  organization: {
    update: "允许修改工作区基础设置，例如工作区名称；不包含成员、角色和邀请管理。",
  },
  questionTemplate: {
    create: "允许在「面试题」页面新增题目模板。",
    delete: "允许删除题目模板。",
    read: "允许加载题目模板列表、全部模板选项、模板详情、版本详情和面试题相关选择器。",
    update: "允许编辑、归档/恢复题目模板和模板版本内容。",
  },
  resumeLibrary: {
    create: "允许上传或创建「简历库」候选人记录；从简历广场导入简历库也需要该权限。",
    delete: "允许删除和批量删除「简历库」候选人记录。",
    read: "允许加载「简历库」列表、详情、时间线、AI 面试轮次、简历文件/预览、技能建议和去重检查；在招岗位里的推荐候选人接口也需要该权限。",
    update: "允许编辑「简历库」候选人资料、替换/解析简历，并从简历库发起 AI 面试。",
  },
  resumePool: {
    create: "允许在「简历广场」上传私有或公开简历。",
    delete: "允许删除自己在「简历广场」中的私有记录。",
    import: "允许从「简历广场」发起导入；真正写入简历库还同时需要「简历库」新增权限。",
    publish: "允许把自己的私有简历发布到公开「简历广场」。",
    read: "允许加载「简历广场」列表、详情、简历文件和预览。",
  },
  resumeUploadBatch: {
    cancel: "允许取消正在处理或暂停中的上传批次。",
    create: "允许创建批量上传批次并上传待处理文件。",
    delete: "允许删除上传批次记录。",
    process: "允许继续处理、恢复或推进上传批次中的文件。",
    read: "允许查看上传批次列表、活跃批次和批次详情。",
  },
};

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
      PAGE_PERMISSION_DESCRIPTIONS[action] ??
      `控制该角色是否能在侧边栏看到并访问「${actionLabel}」页面；页面内数据和操作仍受对应业务权限控制。`;
    return description.includes("404") ? description : `${description}未勾选时直接访问会进入 404。`;
  }

  const directDescription = RESOURCE_ACTION_DESCRIPTIONS[resource]?.[action];
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
  key: `${PermissionResource}:${string}`;
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
        const key = `${resource.key}:${action}` as `${PermissionResource}:${string}`;
        const actionLabel =
          PERMISSION_ITEM_ACTION_LABELS[key] ?? PERMISSION_ACTION_LABELS[action] ?? action;
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

export function copyPermissionRecord(
  permission: PermissionRecord | null | undefined,
): PermissionRecord {
  return Object.fromEntries(
    Object.entries(permission ?? {}).map(([resource, actions]) => [
      resource,
      actions ? [...new Set(actions)] : [],
    ]),
  ) as PermissionRecord;
}

export function canManageWorkspacePermissions(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

function readUnknownErrorMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message?: string };
    if (message) {
      return message;
    }
  }
  return undefined;
}

function readUnknownErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const { code } = error as { code?: string };
    if (code) {
      return code;
    }
  }
  return undefined;
}

export function readRoleDeleteError(error: unknown): string {
  const message = readUnknownErrorMessage(error);
  if (
    readUnknownErrorCode(error) === "ROLE_IS_ASSIGNED_TO_MEMBERS" ||
    message?.includes("Cannot delete a role that is assigned to members")
  ) {
    return ROLE_ASSIGNED_TO_MEMBERS_MESSAGE;
  }
  return message ?? "删除角色失败";
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
): PermissionRecord {
  const current = new Set(getPermissionActions(permission, resource));
  if (current.has(action)) {
    current.delete(action);
  } else {
    current.add(action);
  }
  const next = { ...permission };
  if (current.size === 0) {
    return Object.fromEntries(
      Object.entries(next).filter(([key]) => key !== resource),
    ) as PermissionRecord;
  }
  next[resource] = [...current];
  return next;
}
