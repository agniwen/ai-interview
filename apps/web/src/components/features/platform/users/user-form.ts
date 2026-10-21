import {
  getPasswordPolicyViolation,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@app/shared/password-policy";
import {
  DEFAULT_PLATFORM_INITIAL_WORKSPACE_ROLE,
  PLATFORM_INITIAL_WORKSPACE_ROLES,
} from "@app/shared/permissions";
import type { PlatformInitialWorkspaceRole } from "@app/shared/permissions";
import { z } from "zod";

export const USER_NAME_MAX_LENGTH = 80;

// 平台后台创建的账号一律是普通用户；角色不在此处指定或修改。
// Accounts created from the platform console are always regular users; roles are not edited here.
export const CREATED_USER_ROLE = "user";

const nameSchema = z
  .string()
  .trim()
  .min(1, "请输入姓名")
  .max(USER_NAME_MAX_LENGTH, `姓名不能超过 ${USER_NAME_MAX_LENGTH} 个字符`);

export const PASSWORD_MISMATCH_MESSAGE = "两次输入的密码不一致";

/**
 * 确认密码的实时状态。还在输入且仍是密码前缀时为 pending，不提前报错；
 * 一旦偏离、超长或失焦后仍不一致，就判定为 mismatch。
 *
 * Live confirm state: a still-typing prefix is "pending" (no premature error); diverging,
 * overshooting, or leaving the field while different is a "mismatch".
 */
export function getConfirmPasswordState(
  password: string,
  confirmPassword: string,
  { blurred }: { blurred: boolean },
): "empty" | "pending" | "match" | "mismatch" {
  if (!confirmPassword) {
    return "empty";
  }
  if (confirmPassword === password) {
    return "match";
  }
  const stillTypingPrefix =
    !blurred && confirmPassword.length < password.length && password.startsWith(confirmPassword);
  return stillTypingPrefix ? "pending" : "mismatch";
}

// 与服务端 Better Auth 钩子共用 `@app/shared/password-policy`；admin.createUser
// 本身不校验密码长度，服务端靠钩子兜底。
// Shares `@app/shared/password-policy` with the Better Auth server hook.
function addPasswordIssues(
  value: { confirmPassword: string; password: string },
  context: z.RefinementCtx,
  { allowEmpty }: { allowEmpty: boolean },
) {
  if (allowEmpty && !value.password) {
    if (value.confirmPassword) {
      context.addIssue({
        code: "custom",
        message: PASSWORD_MISMATCH_MESSAGE,
        path: ["confirmPassword"],
      });
    }
    return;
  }
  const violation = getPasswordPolicyViolation(value.password);
  if (violation) {
    context.addIssue({ code: "custom", message: violation, path: ["password"] });
  }
  if (!value.confirmPassword) {
    context.addIssue({ code: "custom", message: "请再次输入密码", path: ["confirmPassword"] });
  } else if (value.confirmPassword !== value.password) {
    context.addIssue({
      code: "custom",
      message: PASSWORD_MISMATCH_MESSAGE,
      path: ["confirmPassword"],
    });
  }
}

export interface PlatformWorkspaceOption {
  id: string;
  name: string;
  slug: string;
}

export interface UserFormValues {
  confirmPassword: string;
  email: string;
  name: string;
  password: string;
  /** 创建时可选的初始工作区。Optional initial workspace on create. */
  workspace: PlatformWorkspaceOption | null;
  /** 初始工作区中的成员角色；未选工作区时为 null。Role in the initial workspace. */
  workspaceRole: PlatformInitialWorkspaceRole | null;
}

/**
 * 切换初始工作区时的角色：首次选中回落到默认的普通成员；换成另一个工作区或清空时清空角色，
 * 需要重新选择。Role after a workspace change: first pick defaults to member; switching to
 * another workspace or clearing it empties the role so it must be chosen again.
 */
export function getNextWorkspaceRole(
  previous: PlatformWorkspaceOption | null,
  next: PlatformWorkspaceOption | null,
  currentRole: PlatformInitialWorkspaceRole | null,
): PlatformInitialWorkspaceRole | null {
  if (!next) {
    return null;
  }
  if (!previous) {
    return DEFAULT_PLATFORM_INITIAL_WORKSPACE_ROLE;
  }
  return previous.id === next.id ? currentRole : null;
}

const workspaceOptionSchema = z.object({ id: z.string(), name: z.string(), slug: z.string() });

export const createUserFormSchema = z
  .object({
    confirmPassword: z.string(),
    email: z.string().trim().min(1, "请输入邮箱").pipe(z.email("邮箱格式不正确")),
    name: nameSchema,
    password: z.string(),
    workspace: workspaceOptionSchema.nullable(),
    workspaceRole: z.enum(PLATFORM_INITIAL_WORKSPACE_ROLES).nullable(),
  })
  .superRefine((value, context) => {
    addPasswordIssues(value, context, { allowEmpty: false });
    if (value.workspace && !value.workspaceRole) {
      context.addIssue({ code: "custom", message: "请选择工作区角色", path: ["workspaceRole"] });
    }
  });

// 编辑时邮箱只读；密码与确认密码都留空表示不修改密码。
// Email is read-only when editing; leaving both password fields empty keeps the password.
export const editUserFormSchema = z
  .object({
    confirmPassword: z.string(),
    email: z.string(),
    name: nameSchema,
    password: z.string(),
    // 编辑时不展示初始工作区，值恒为 null。Editing never shows the initial workspace.
    workspace: workspaceOptionSchema.nullable(),
    workspaceRole: z.enum(PLATFORM_INITIAL_WORKSPACE_ROLES).nullable(),
  })
  .superRefine((value, context) => addPasswordIssues(value, context, { allowEmpty: true }));

export interface EditableUser {
  email: string;
  id: string;
  name: string;
}

export function createUserFormValues(user: EditableUser | null): UserFormValues {
  if (!user) {
    return {
      confirmPassword: "",
      email: "",
      name: "",
      password: "",
      workspace: null,
      workspaceRole: null,
    };
  }
  return {
    confirmPassword: "",
    email: user.email,
    name: user.name,
    password: "",
    workspace: null,
    workspaceRole: null,
  };
}

// 只允许改姓名：不带 role，已有的平台管理员编辑后保持原角色。
// Name only: never send role, so existing platform admins keep their role.
export interface UserUpdateData {
  name: string;
}

export interface UserUpdatePlan {
  /** `admin.updateUser` 的 data；null 表示无需调用。Null skips the call. */
  data: UserUpdateData | null;
  /** `admin.setUserPassword` 的新密码；null 表示不重置。Null keeps the password. */
  newPassword: string | null;
}

/**
 * 只提交真正改动的字段，避免空 update（Better Auth 会报 NO_DATA_TO_UPDATE）。
 * Submit only changed fields; Better Auth rejects empty updates.
 */
export function buildUserUpdatePlan(user: EditableUser, values: UserFormValues): UserUpdatePlan {
  const name = values.name.trim();
  return {
    data: name === user.name ? null : { name },
    newPassword: values.password || null,
  };
}

const AUTH_ERROR_MESSAGES = {
  INVALID_EMAIL: "邮箱格式不正确",
  PASSWORD_TOO_LONG: `密码不能超过 ${PASSWORD_MAX_LENGTH} 位`,
  PASSWORD_TOO_SHORT: `密码至少 ${PASSWORD_MIN_LENGTH} 位`,
  PASSWORD_TOO_WEAK: "密码强度不足，请按提示调整",
  USER_ALREADY_EXISTS: "该邮箱已被其他账号使用",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "该邮箱已被其他账号使用",
  USER_NOT_FOUND: "用户不存在或已被删除",
  YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: "没有设置用户角色的权限",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "没有创建用户的权限",
  YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: "没有重置用户密码的权限",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "没有编辑用户的权限",
} as const;

function isKnownAuthErrorCode(code: string): code is keyof typeof AUTH_ERROR_MESSAGES {
  return Object.hasOwn(AUTH_ERROR_MESSAGES, code);
}

export interface AuthActionError {
  code?: string;
  message?: string;
}

export function getAuthErrorMessage(
  error: AuthActionError | null | undefined,
  fallback: string,
): string {
  const code = error?.code;
  return code && isKnownAuthErrorCode(code) ? AUTH_ERROR_MESSAGES[code] : fallback;
}
