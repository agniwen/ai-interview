import type { Env } from "@/server/type";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { skillAccessToken, skillDeviceAuthCode } from "@/lib/server/db/schema";
import { factory } from "@/server/factory";

// =====================================================================
// Skill OAuth Device Authorization Grant (RFC 8628) helpers + Bearer
// middleware. All exports here are for internal use of the skill router.
// 中文：技能 OAuth 设备授权流（RFC 8628）工具方法 + Bearer 中间件。
// =====================================================================

const DEVICE_CODE_TTL_SECONDS = Number.parseInt(
  process.env.SKILL_OAUTH_DEVICE_CODE_TTL ?? "600",
  10,
);
const DEVICE_POLL_INTERVAL_SECONDS = 5;
const TOKEN_BYTES = 48;
const DEVICE_CODE_BYTES = 32;
// 去掉易混字符 0/O/1/I/L / unambiguous chars only
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789";
const USER_CODE_GROUP = 4;
const USER_CODE_GROUPS = 2;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RATE_LIMIT = Number.parseInt(process.env.SKILL_RATE_LIMIT_PER_DAY ?? "50", 10);

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function generateDeviceCode(): string {
  return randomBytes(DEVICE_CODE_BYTES).toString("base64url");
}

function generateUserCode(): string {
  const totalChars = USER_CODE_GROUP * USER_CODE_GROUPS;
  const buf = randomBytes(totalChars);
  const chars: string[] = [];
  for (let i = 0; i < totalChars; i += 1) {
    chars.push(USER_CODE_ALPHABET[buf[i] % USER_CODE_ALPHABET.length]);
  }
  const groups: string[] = [];
  for (let g = 0; g < USER_CODE_GROUPS; g += 1) {
    groups.push(chars.slice(g * USER_CODE_GROUP, (g + 1) * USER_CODE_GROUP).join(""));
  }
  return groups.join("-");
}

function generateAccessToken(): string {
  // 前缀方便日志/泄漏识别 / prefix aids leak detection
  return `rps_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

function resolveBaseURL(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

// =====================================================================
// 审批通过后明文 token 不入库，只放进短 TTL 的内存 map，等设备首次 poll
// 时取走并清理；进程重启会让未取走的 token 失效，符合 RFC 8628 一次性语义。
// Plaintext tokens live only in this in-memory map between approve and
// the device's successful poll. Process restart forfeits unfetched tokens.
// =====================================================================

const pendingPlaintextTokens = new Map<string, { token: string; expiresAt: number }>();

function rememberPlaintext(deviceCode: string, token: string): void {
  pendingPlaintextTokens.set(deviceCode, {
    expiresAt: Date.now() + DEVICE_CODE_TTL_SECONDS * 1000,
    token,
  });
  // 顺便清理过期项 / opportunistic cleanup
  for (const [k, v] of pendingPlaintextTokens.entries()) {
    if (v.expiresAt < Date.now()) {
      pendingPlaintextTokens.delete(k);
    }
  }
}

function takePlaintext(deviceCode: string): string | null {
  const entry = pendingPlaintextTokens.get(deviceCode);
  if (!entry) {
    return null;
  }
  pendingPlaintextTokens.delete(deviceCode);
  if (entry.expiresAt < Date.now()) {
    return null;
  }
  return entry.token;
}

// =====================================================================
// Public API
// =====================================================================

export interface IssueDeviceCodeResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export async function issueDeviceCode(scope: string): Promise<IssueDeviceCodeResult> {
  // 同一秒内多次撞 user_code 概率极低，循环重试避免 unique 冲突
  // / retry on the rare user_code collision instead of erroring out
  let userCode = generateUserCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db
      .select({ deviceCode: skillDeviceAuthCode.deviceCode })
      .from(skillDeviceAuthCode)
      .where(eq(skillDeviceAuthCode.userCode, userCode))
      .limit(1);
    if (existing.length === 0) {
      break;
    }
    userCode = generateUserCode();
  }

  const deviceCode = generateDeviceCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEVICE_CODE_TTL_SECONDS * 1000);

  await db.insert(skillDeviceAuthCode).values({
    deviceCode,
    expiresAt,
    pollAfter: now,
    scope,
    status: "pending",
    userCode,
  });

  const baseURL = resolveBaseURL();
  const verificationUri = `${baseURL}/skill/authorize`;
  const verificationUriComplete = `${verificationUri}?user_code=${encodeURIComponent(userCode)}`;

  return {
    device_code: deviceCode,
    expires_in: DEVICE_CODE_TTL_SECONDS,
    interval: DEVICE_POLL_INTERVAL_SECONDS,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: verificationUriComplete,
  };
}

export type DeviceTokenResponse =
  | {
      access_token: string;
      token_type: "Bearer";
      scope: string;
    }
  | {
      error:
        | "authorization_pending"
        | "slow_down"
        | "expired_token"
        | "access_denied"
        | "invalid_grant";
      error_description?: string;
    };

export async function pollDeviceCode(deviceCode: string): Promise<{
  status: number;
  body: DeviceTokenResponse;
}> {
  const [row] = await db
    .select()
    .from(skillDeviceAuthCode)
    .where(eq(skillDeviceAuthCode.deviceCode, deviceCode))
    .limit(1);

  if (!row) {
    return { body: { error: "invalid_grant" }, status: 400 };
  }

  const now = new Date();
  if (row.expiresAt.getTime() <= now.getTime()) {
    if (row.status === "pending") {
      await db
        .update(skillDeviceAuthCode)
        .set({ status: "expired" })
        .where(eq(skillDeviceAuthCode.deviceCode, deviceCode));
    }
    return { body: { error: "expired_token" }, status: 400 };
  }

  if (row.status === "denied") {
    return { body: { error: "access_denied" }, status: 400 };
  }

  if (row.status === "expired") {
    return { body: { error: "expired_token" }, status: 400 };
  }

  if (row.status === "pending") {
    if (row.pollAfter && row.pollAfter.getTime() > now.getTime()) {
      return { body: { error: "slow_down" }, status: 400 };
    }
    const nextPoll = new Date(now.getTime() + DEVICE_POLL_INTERVAL_SECONDS * 1000);
    await db
      .update(skillDeviceAuthCode)
      .set({ pollAfter: nextPoll })
      .where(eq(skillDeviceAuthCode.deviceCode, deviceCode));
    return { body: { error: "authorization_pending" }, status: 400 };
  }

  // status === "approved" — fetch plaintext from in-memory map (one-time)
  const plaintext = takePlaintext(deviceCode);
  if (!plaintext) {
    return { body: { error: "invalid_grant" }, status: 400 };
  }

  await db.delete(skillDeviceAuthCode).where(eq(skillDeviceAuthCode.deviceCode, deviceCode));

  return {
    body: {
      access_token: plaintext,
      scope: row.scope,
      token_type: "Bearer",
    },
    status: 200,
  };
}

export interface ApproveDeviceCodeResult {
  ok: true;
  scope: string;
}

export async function approveDeviceCode(
  userCode: string,
  userId: string,
): Promise<{ status: number; body: ApproveDeviceCodeResult | { error: string } }> {
  const normalized = userCode.trim().toUpperCase();
  const [row] = await db
    .select()
    .from(skillDeviceAuthCode)
    .where(eq(skillDeviceAuthCode.userCode, normalized))
    .limit(1);

  if (!row) {
    return { body: { error: "未找到该授权码，请检查是否输入正确。" }, status: 404 };
  }

  if (row.status !== "pending") {
    return { body: { error: "该授权码已被处理或已过期。" }, status: 409 };
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await db
      .update(skillDeviceAuthCode)
      .set({ status: "expired" })
      .where(eq(skillDeviceAuthCode.deviceCode, row.deviceCode));
    return { body: { error: "该授权码已过期，请在终端重新发起。" }, status: 410 };
  }

  const plaintext = generateAccessToken();
  const tokenId = crypto.randomUUID();
  await db.insert(skillAccessToken).values({
    id: tokenId,
    name: "Resume Parser Skill",
    scope: row.scope,
    tokenHash: sha256Hex(plaintext),
    userId,
  });

  await db
    .update(skillDeviceAuthCode)
    .set({ approvedTokenId: tokenId, status: "approved", userId })
    .where(eq(skillDeviceAuthCode.deviceCode, row.deviceCode));

  rememberPlaintext(row.deviceCode, plaintext);

  return { body: { ok: true, scope: row.scope }, status: 200 };
}

export async function denyDeviceCode(
  userCode: string,
): Promise<{ status: number; body: { ok: true } | { error: string } }> {
  const normalized = userCode.trim().toUpperCase();
  const [row] = await db
    .select()
    .from(skillDeviceAuthCode)
    .where(eq(skillDeviceAuthCode.userCode, normalized))
    .limit(1);

  if (!row) {
    return { body: { error: "未找到该授权码。" }, status: 404 };
  }

  if (row.status !== "pending") {
    return { body: { error: "该授权码已被处理。" }, status: 409 };
  }

  await db
    .update(skillDeviceAuthCode)
    .set({ status: "denied" })
    .where(eq(skillDeviceAuthCode.deviceCode, row.deviceCode));

  return { body: { ok: true }, status: 200 };
}

// =====================================================================
// Bearer middleware
// =====================================================================

async function runFireAndForget(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // 异步副作用，吞掉错误避免影响主流程 / swallow async side-effect errors
  }
}

async function reapExpiredDeviceCodes(): Promise<void> {
  await db
    .delete(skillDeviceAuthCode)
    .where(
      and(eq(skillDeviceAuthCode.status, "pending"), lt(skillDeviceAuthCode.expiresAt, new Date())),
    );
}

export interface SkillTokenContext {
  tokenId: string;
  userId: string;
  scope: string;
}

declare module "hono" {
  interface ContextVariableMap {
    skillToken: SkillTokenContext;
  }
}

export function requireSkillToken(requiredScope: string) {
  return factory.createMiddleware(async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "缺少 Bearer token。" }, 401);
    }
    const plaintext = header.slice("Bearer ".length).trim();
    if (!plaintext) {
      return c.json({ error: "Bearer token 为空。" }, 401);
    }

    const [row] = await db
      .select()
      .from(skillAccessToken)
      .where(eq(skillAccessToken.tokenHash, sha256Hex(plaintext)))
      .limit(1);

    if (!row) {
      return c.json({ error: "无效的 token，请重新登录。" }, 401);
    }
    if (row.revokedAt) {
      return c.json({ error: "该 token 已被撤销。" }, 401);
    }
    if (row.scope !== requiredScope) {
      return c.json({ error: `Token scope 不匹配（需要 ${requiredScope}）。` }, 403);
    }

    c.set("skillToken", {
      scope: row.scope,
      tokenId: row.id,
      userId: row.userId,
    });

    // 不阻塞主流程的清理 / fire-and-forget cleanup + last-used
    void runFireAndForget(async () => {
      await reapExpiredDeviceCodes();
    });
    void runFireAndForget(async () => {
      await db
        .update(skillAccessToken)
        .set({ lastUsedAt: new Date() })
        .where(eq(skillAccessToken.id, row.id));
    });

    return next();
  });
}

// =====================================================================
// 简单的滑动窗口限流 — 内存版，按 tokenId + scope 维度
// Simple sliding-window rate limiter, in-memory, keyed by tokenId+scope.
// 单实例足够；多实例部署需切到 Redis。
// =====================================================================

const rateBuckets = new Map<string, number[]>();

export function rateLimitPerToken(maxRequests = DEFAULT_RATE_LIMIT) {
  // oxlint-disable-next-line require-await -- Hono middleware signature requires async.
  return factory.createMiddleware(async (c, next) => {
    const ctx = c.get("skillToken");
    if (!ctx) {
      // 没经过 requireSkillToken，放行（不应该发生）
      return next();
    }
    const key = `${ctx.tokenId}:${ctx.scope}`;
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    const list = (rateBuckets.get(key) ?? []).filter((t) => t > cutoff);

    if (list.length >= maxRequests) {
      const [oldest] = list;
      const retryAfter = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "已达每日调用上限，请稍后再试。", retry_after: retryAfter }, 429);
    }

    list.push(now);
    rateBuckets.set(key, list);
    return next();
  });
}

// Internal helper exposed for tests
export function _resetRateBucketsForTests(): void {
  rateBuckets.clear();
}

export type SkillEnv = Env;
