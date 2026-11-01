import { getPasswordPolicyViolation } from "@app/shared/password-policy";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { z } from "zod";

// 所有会写入新密码的 Better Auth 端点，以及各自承载密码的请求字段。
// 登录（/sign-in/email）不在此列：已有密码不会因规则收紧而无法登录。
// Every Better Auth endpoint that stores a new password, and the body field carrying it.
// Sign-in is deliberately excluded so existing passwords keep working.
const PASSWORD_FIELD_BY_PATH = {
  "/admin/create-user": "password",
  "/admin/set-user-password": "newPassword",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
  "/set-password": "newPassword",
  "/sign-up/email": "password",
} as const;

type PasswordSettingPath = keyof typeof PASSWORD_FIELD_BY_PATH;

const passwordBodySchema = z.object({
  newPassword: z.string().optional(),
  password: z.string().optional(),
});

function isPasswordSettingPath(path: string): path is PasswordSettingPath {
  return Object.hasOwn(PASSWORD_FIELD_BY_PATH, path);
}

/**
 * 在 Better Auth 写入密码前执行共享的密码规则（长度 + 至少三类字符）。
 * Enforces the shared password policy before Better Auth stores any password.
 */
export const enforcePasswordPolicy = createAuthMiddleware((ctx) => {
  if (!isPasswordSettingPath(ctx.path)) {
    return Promise.resolve();
  }
  const body = passwordBodySchema.safeParse(ctx.body);
  const password = body.success ? body.data[PASSWORD_FIELD_BY_PATH[ctx.path]] : undefined;
  // admin.createUser 允许不设密码（仅第三方登录）；畸形请求交给端点自身校验。
  // createUser may omit the password; malformed bodies are left to the endpoint's own schema.
  if (password === undefined) {
    return Promise.resolve();
  }
  const violation = getPasswordPolicyViolation(password);
  if (violation) {
    return Promise.reject(
      APIError.from("BAD_REQUEST", { code: "PASSWORD_TOO_WEAK", message: violation }),
    );
  }
  return Promise.resolve();
});
