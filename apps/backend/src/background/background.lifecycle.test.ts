import { afterEach, describe, expect, it, vi } from "vitest";
import { BackgroundLifecycleService } from "./background.lifecycle.js";

afterEach(() => vi.clearAllMocks());

function createLifecycle(enabled: boolean) {
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
  const drainCoordinator = { register: vi.fn() };
  const config = {
    get: vi.fn((name: string) => {
      if (name === "BACKGROUND_WORKERS_ENABLED") {
        return enabled;
      }
      if (name === "RESUME_SEMANTIC_INDEX_ENABLED") {
        return false;
      }
      return "redis://127.0.0.1:6379";
    }),
  };
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
    drainCoordinator as never,
    config as never,
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
  return {
    adapter,
    drainCoordinator,
    lifecycle,
    mail,
    notifications,
    processors,
    queue,
    recovery,
    registrar,
  };
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

    expect(subject.drainCoordinator.register).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "background-intake", order: 25 }),
    );
    expect(subject.drainCoordinator.register).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "background-resources", order: 100 }),
    );
    const intake = subject.drainCoordinator.register.mock.calls[0]?.[0];
    const resources = subject.drainCoordinator.register.mock.calls[1]?.[0];
    await intake?.drain();
    expect(subject.processors.close).toHaveBeenCalledOnce();
    expect(subject.queue.close).not.toHaveBeenCalled();
    await resources?.drain();
    expect(subject.queue.close).toHaveBeenCalledTimes(9);
    const quiescedAt = Math.max(
      subject.mail.close.mock.invocationCallOrder[0] ?? 0,
      subject.notifications.close.mock.invocationCallOrder[0] ?? 0,
      subject.recovery.close.mock.invocationCallOrder[0] ?? 0,
    );
    const processorsClosedAt = subject.processors.close.mock.invocationCallOrder[0] ?? 0;
    const queuesClosedAt = subject.queue.close.mock.invocationCallOrder[0] ?? 0;
    expect(processorsClosedAt).toBeGreaterThan(quiescedAt);
    expect(queuesClosedAt).toBeGreaterThan(processorsClosedAt);
  });

  it("stops Bull workers before waiting for active intake services", async () => {
    const subject = createLifecycle(true);
    await subject.lifecycle.start();

    const recoveryClose = Promise.withResolvers<null>();
    subject.recovery.close.mockReturnValueOnce(recoveryClose.promise);

    const intake = subject.drainCoordinator.register.mock.calls[0]?.[0];
    const intakeDrain = intake?.drain();

    expect(subject.recovery.close).toHaveBeenCalledOnce();
    expect(subject.processors.close).toHaveBeenCalledOnce();
    expect(subject.queue.close).not.toHaveBeenCalled();

    recoveryClose.resolve(null);
    await intakeDrain;
  });
});
