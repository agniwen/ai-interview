import { afterEach, describe, expect, it, vi } from "vitest";
import { BackgroundLifecycleService } from "./background.lifecycle.js";

const originalEnabled = process.env.BACKGROUND_WORKERS_ENABLED;
const originalRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  if (originalEnabled === undefined) {
    delete process.env.BACKGROUND_WORKERS_ENABLED;
  } else {
    process.env.BACKGROUND_WORKERS_ENABLED = originalEnabled;
  }
  if (originalRedisUrl === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = originalRedisUrl;
  }
});

function createLifecycle(enabled: boolean) {
  process.env.BACKGROUND_WORKERS_ENABLED = String(enabled);
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  const registrar = { register: vi.fn() };
  const adapter = {
    assertConfigured: vi.fn(),
    prepareMeetingTranscription: vi.fn().mockResolvedValue(true),
  };
  const processors = { close: vi.fn().mockResolvedValue(null), start: vi.fn() };
  const recovery = {
    close: vi.fn().mockResolvedValue(null),
    start: vi.fn().mockResolvedValue(null),
  };
  const mail = {
    close: vi.fn().mockResolvedValue(null),
    enabled: false,
    start: vi.fn(),
  };
  const notifications = { close: vi.fn().mockResolvedValue(null), start: vi.fn() };
  const diagnostics = { bindLifecycle: vi.fn() };
  const queue = { close: vi.fn().mockResolvedValue(null) };
  // SAFETY: each narrow fake implements exactly the methods exercised by lifecycle startup/close.
  const lifecycle = new BackgroundLifecycleService(
    registrar as never,
    adapter as never,
    processors as never,
    recovery as never,
    mail as never,
    notifications as never,
    diagnostics as never,
    queue as never,
    queue as never,
    queue as never,
    queue as never,
    queue as never,
    queue as never,
    queue as never,
    queue as never,
    queue as never,
  );
  return { adapter, lifecycle, mail, notifications, processors, queue, recovery, registrar };
}

describe("BackgroundLifecycleService replica modes", () => {
  it("does not register BullMQ or touch queues when workers are disabled", async () => {
    const subject = createLifecycle(false);
    await subject.lifecycle.start();
    await subject.lifecycle.close();

    expect(subject.registrar.register).not.toHaveBeenCalled();
    expect(subject.adapter.assertConfigured).not.toHaveBeenCalled();
    expect(subject.processors.start).not.toHaveBeenCalled();
    expect(subject.queue.close).not.toHaveBeenCalled();
  });

  it("registers, starts, and drains all worker services when enabled", async () => {
    const subject = createLifecycle(true);
    await subject.lifecycle.start();

    expect(subject.registrar.register).toHaveBeenCalledOnce();
    expect(subject.adapter.assertConfigured).toHaveBeenCalledOnce();
    expect(subject.recovery.start).toHaveBeenCalledWith({ transcription: true });
    expect(subject.processors.start).toHaveBeenCalledOnce();
    expect(subject.lifecycle.getSnapshot()).toMatchObject({ ready: true, registered: true });

    await subject.lifecycle.close();
    expect(subject.processors.close).toHaveBeenCalledOnce();
    expect(subject.queue.close).toHaveBeenCalledTimes(9);
  });
});
