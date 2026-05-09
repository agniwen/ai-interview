import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { factory } from "@/server/factory";

// =====================================================================
// 自建 admin 用户密码端点。
// better-auth 的 admin.setUserPassword 内部走 updateMany(providerId='credential')，
// 对没有 credential account 行的用户（如飞书 OAuth 用户）会静默不更新，
// 导致后续登录命中 sign-in 的「Credential account not found」。
// 这里手动 upsert 一行 credential 账户，密码哈希复用 better-auth 的内置实现。
//
// Custom admin set-user-password endpoint.
// better-auth's admin.setUserPassword uses updateMany on (userId, providerId='credential'),
// which silently no-ops for users that lack a credential account row (e.g. Feishu OAuth
// users). That makes subsequent email/password sign-in fail with "Credential account not
// found". We upsert the credential row ourselves and reuse better-auth's password hasher.
// =====================================================================

const setPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export const adminUsersRouter = factory.createApp().post("/:id/password", async (c) => {
  // 仅 better-auth role==='admin' 可以为他人设密码（Hono 的 adminMiddleware 只校验
  // 飞书组织白名单，这里再叠加一层 role 检查）。
  // Only better-auth role==='admin' may reset others' passwords. The Hono
  // adminMiddleware only enforces Feishu-org allowlisting; layer role on top.
  if (c.var.user?.role !== "admin") {
    return c.json({ error: "仅管理员可以为其他用户设置密码" }, 403);
  }

  const userId = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = setPasswordSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "密码格式不合法" }, 400);
  }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(parsed.data.password);

  const [existing] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);

  const now = new Date();
  await (existing
    ? db
        .update(account)
        .set({ password: hashed, updatedAt: now })
        .where(eq(account.id, existing.id))
    : db.insert(account).values({
        accountId: userId,
        createdAt: now,
        id: crypto.randomUUID(),
        password: hashed,
        providerId: "credential",
        updatedAt: now,
        userId,
      }));

  return c.json({ success: true });
});
