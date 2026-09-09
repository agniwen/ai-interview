import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { MeetingTaskError } from "./task-error";
import type { LocalProcessingBinding } from "./task-store";

const errorSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});
const sessionSchema = z.object({ user: z.object({ id: z.string() }) }).nullable();

/** Uses Electron's authenticated session. No cookie or model key crosses the renderer bridge. */
export class EchoServerClient {
  private readonly fetcher: typeof fetch;
  private readonly origin: string;
  readonly deviceId: string;

  constructor(input: { fetch: typeof fetch; origin: string; deviceId: string }) {
    this.fetcher = input.fetch;
    this.origin = new URL(input.origin).origin;
    this.deviceId = input.deviceId;
  }

  async assertAccount(binding: LocalProcessingBinding, signal: AbortSignal): Promise<void> {
    const session = await this.request("/api/auth/get-session", sessionSchema, { signal });
    if (session?.user.id !== binding.account_id) {
      throw new MeetingTaskError("authorization", "请登录创建此录音的账号后重试");
    }
  }

  static meetingsPath(binding: LocalProcessingBinding): string {
    return `/api/w/${encodeURIComponent(binding.workspace_slug)}/meetings`;
  }

  async operation<T>(
    path: string,
    schema: z.ZodType<T>,
    input: {
      body: string;
      signal: AbortSignal;
      accountId: string;
      workspaceId?: string;
    },
  ): Promise<T> {
    const responseSchema = z.discriminatedUnion("state", [
      z.object({ state: z.literal("busy") }),
      z.object({ result: schema, state: z.literal("complete") }),
    ]);
    while (!input.signal.aborted) {
      const response = await this.request(path, responseSchema, { ...input, method: "POST" });
      if (response.state === "complete") {
        return response.result;
      }
      await delay(5000, undefined, { signal: input.signal });
    }
    throw new MeetingTaskError("offline", "处理已暂停");
  }

  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    input: {
      body?: string;
      method?: string;
      signal: AbortSignal;
      accountId?: string;
      workspaceId?: string;
    },
  ): Promise<T> {
    const headers = new Headers({
      "Content-Type": "application/json",
      "X-Echo-Device-Id": this.deviceId,
    });
    if (input.accountId) {
      headers.set("X-Echo-Account-Id", input.accountId);
    }
    if (input.workspaceId) {
      headers.set("X-Echo-Workspace-Id", input.workspaceId);
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.origin}${path}`, {
        body: input.body,
        credentials: "include",
        headers,
        method: input.method ?? "GET",
        signal: input.signal,
      });
    } catch (error) {
      throw new MeetingTaskError("offline", error instanceof Error ? error.message : "网络不可用");
    }
    if (!response.ok) {
      const parsed = errorSchema.safeParse(await response.json().catch(() => null));
      const message = parsed.success ? (parsed.data.error ?? parsed.data.message) : null;
      if (response.status === 401 || response.status === 403) {
        throw new MeetingTaskError("authorization", message ?? "登录或权限需要更新");
      }
      if (response.status === 402 || response.status === 429) {
        throw new MeetingTaskError("quota", message ?? "请求额度不足，请稍后手动重试");
      }
      throw new MeetingTaskError(
        response.status >= 500 ? "transient" : "invalid",
        message ?? `服务器请求失败 (${response.status})`,
      );
    }
    return schema.parse(response.status === 204 ? null : await response.json());
  }
}
