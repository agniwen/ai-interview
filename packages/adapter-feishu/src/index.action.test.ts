// 中文：飞书卡片按钮点击的 webhook 测试；走真实 fixture
// English: webhook test for card-action callback dispatch; uses real fixture
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "chat";
import { describe, expect, it, vi } from "vitest";
import { FeishuAdapter } from "./index";

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const fixture = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__/card-action-event.json"), "utf-8"),
);

// 中文：静默 logger，避免测试控制台噪音
// English: silent logger to keep test output clean
const silentLogger: Logger = {
  child: vi.fn().mockReturnThis(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

// 中文：创建用于测试的适配器实例，提供最小必要配置
// English: create a minimal adapter instance for testing
function makeAdapter() {
  return new FeishuAdapter({
    appId: "test-app-id",
    appSecret: "test-app-secret",
    logger: silentLogger,
    userName: "test-bot",
  });
}

describe("handleWebhook → card action", () => {
  it("dispatches a card-button click to chat.processAction", async () => {
    const adapter = makeAdapter();
    // 中文：捕获 processAction 收到的第一个参数，供后续断言使用
    // English: capture the first argument passed to processAction for assertions
    let capturedEvent: unknown;
    const processAction = vi.fn((event: unknown) => {
      capturedEvent = event;
      return Promise.resolve();
    });
    // Simulate chat-sdk attachment by injecting a chat-shaped object that
    // exposes processAction. The adapter only needs `this.chat.processAction`
    // for this codepath. Other chat methods are not invoked.
    (adapter as unknown as { chat: { processAction: typeof processAction } }).chat = {
      processAction,
    };

    const req = new Request("http://localhost/api/feishu/webhook", {
      body: JSON.stringify(fixture),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const res = await adapter.handleWebhook(req);

    expect(res.status).toBe(200);
    expect(processAction).toHaveBeenCalledOnce();
    const eventArg = capturedEvent as {
      actionId: string;
      value?: string;
      adapter: unknown;
      threadId: string;
      messageId: string;
      user: { userId: string };
    };
    expect(eventArg.actionId).toBe("activate-jd");
    expect(eventArg.value).toBe("jd-synthetic-1");
    expect(eventArg.adapter).toBe(adapter);
    expect(eventArg.threadId).toContain("feishu:");
    expect(eventArg.threadId).toContain(":dm");
    expect(eventArg.user.userId).toBe("ou_REDACTED_OPERATOR");
    expect(eventArg.messageId).toBe("om_REDACTED_MESSAGE");
  });

  it("returns 200 for card actions even when no chat is attached", async () => {
    const adapter = makeAdapter();
    // No chat attached — adapter should not throw, just no-op
    const req = new Request("http://localhost/api/feishu/webhook", {
      body: JSON.stringify(fixture),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const res = await adapter.handleWebhook(req);
    expect(res.status).toBe(200);
  });

  it("ignores card actions missing action_id (no chat call)", async () => {
    const adapter = makeAdapter();
    const processAction = vi.fn(() => Promise.resolve());
    (adapter as unknown as { chat: { processAction: typeof processAction } }).chat = {
      processAction,
    };

    const broken = structuredClone(fixture) as typeof fixture;
    broken.event.action.value.action_id = "";

    const req = new Request("http://localhost/api/feishu/webhook", {
      body: JSON.stringify(broken),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const res = await adapter.handleWebhook(req);
    expect(res.status).toBe(200);
    expect(processAction).not.toHaveBeenCalled();
  });
});
