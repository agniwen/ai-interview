import { z } from "zod";

/** Each entry is one independently composable, literal substring condition. */
export const listTextFields = {
  departments: { description: "部门描述", name: "部门名称" },
  forms: { description: "表单说明", title: "表单标题" },
  interviewers: { description: "面试官描述", name: "面试官名称" },
  interviews: {
    candidateName: "候选人",
    email: "候选人邮箱",
    resumeFileName: "简历名",
    targetRole: "岗位",
    title: "轮次名称",
  },
  jobs: { name: "岗位名称", prompt: "岗位 JD" },
  mailAccounts: {
    emailAddress: "监听邮箱",
    imapHost: "IMAP 主机",
    memberEmail: "成员邮箱",
    memberName: "成员姓名",
    subjectKeyword: "监听主题关键词",
    username: "邮箱账号",
  },
  mailLogs: { fromAddress: "发件人", subject: "邮件主题" },
  members: { email: "邮箱", name: "姓名" },
  metrics: { help: "指标说明", name: "指标名称" },
  notifications: {
    candidateName: "候选人",
    error: "错误信息",
    messageId: "消息 ID",
    organizationName: "工作区名称",
    organizationSlug: "工作区标识",
    recipientEmail: "接收人邮箱",
    recipientName: "接收人姓名",
    recipientOpenId: "接收人 Open ID",
    targetRole: "目标岗位",
  },
  organizations: { name: "工作区名称", slug: "工作区标识" },
  parseCache: {
    contentHash: "文件 Hash",
    filename: "文件名",
    organizationName: "工作区名称",
    storageKey: "存储路径",
    userEmail: "用户邮箱",
    userName: "用户姓名",
  },
  platformMailAccounts: {
    emailAddress: "监听邮箱",
    imapHost: "IMAP 主机",
    memberEmail: "成员邮箱",
    memberName: "成员姓名",
    organizationName: "工作区名称",
    organizationSlug: "工作区标识",
    subjectKeyword: "监听主题关键词",
    username: "邮箱账号",
  },
  questions: { description: "题库说明", title: "题库标题" },
  resumes: {
    candidateName: "候选人",
    company: "公司",
    email: "邮箱",
    phone: "电话",
    resumeFileName: "简历名",
    school: "学校",
    targetRole: "目标岗位",
  },
  rooms: { name: "房间名称", sid: "房间 SID" },
  users: { email: "邮箱", name: "姓名" },
} as const;

export type ListTextResource = keyof typeof listTextFields;
export type ListTextValues = Record<string, string>;
const valuesSchema = z.record(z.string().min(1).max(80), z.string().trim().max(200));

export function parseListTextFilters(value?: string | null): ListTextValues {
  if (!value) {
    return {};
  }
  try {
    const parsed = valuesSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function listTextFiltersSchema(resource: ListTextResource) {
  return z
    .string()
    .max(8000)
    .refine((value) => {
      if (!value) {
        return true;
      }
      try {
        const parsed = valuesSchema.safeParse(JSON.parse(value));
        return (
          parsed.success &&
          Object.keys(parsed.data).every((key) => Object.hasOwn(listTextFields[resource], key))
        );
      } catch {
        return false;
      }
    }, "文本筛选条件无效")
    .optional();
}

export function serializeListTextFilters(values: ListTextValues): string {
  const entries = Object.entries(values)
    .filter(([, value]) => value.trim())
    .toSorted(([a], [b]) => a.localeCompare(b));
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : "";
}

/** For resources already loaded in full (members / LiveKit), before pagination. */
export function matchesListTextFilters(
  values: ListTextValues,
  fields: Record<string, string | null | undefined>,
): boolean {
  return Object.entries(values).every(([key, value]) =>
    (fields[key] ?? "").toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()),
  );
}
export function listTextQuery(params: { filters: Record<string, string> }) {
  return { textFilters: params.filters.textFilters || undefined };
}
