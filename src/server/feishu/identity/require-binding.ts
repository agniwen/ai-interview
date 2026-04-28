// 中文：飞书 open_id → Studio userId 的绑定 gate；未绑定时调用方返回 OAuth 卡片
// English: OAuth binding gate; callers should reply with the OAuth card when unbound
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";

const FEISHU_PROVIDERS = ["feishu", "feishu-jiguang"] as const;

export type RequireBindingResult = { userId: string } | { unbound: true };

export async function requireBinding(
  openId: string,
  providerHint?: string,
): Promise<RequireBindingResult> {
  const providers = providerHint ? [providerHint] : [...FEISHU_PROVIDERS];

  const [row] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(eq(account.accountId, openId), inArray(account.providerId, providers)))
    .limit(1);

  if (!row) {
    return { unbound: true };
  }
  return { userId: row.userId };
}
