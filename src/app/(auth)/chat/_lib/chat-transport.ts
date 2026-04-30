import type { UIMessage } from "ai";
import { WorkflowChatTransport } from "@workflow/ai";

const CHAT_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;

/**
 * 在 `WorkflowChatTransport` 之上加一层 abort 控制 + 请求超时:
 *  - `abort()` 会中断该 transport 上所有正在进行的 fetch（包含 AI SDK 内部不传 signal 的
 *    `reconnectToStream`），用于路由切走时清理本地连接、或者 iOS 上的 stop 兜底。
 *  - 8 分钟级别的客户端超时，避免单个请求长期挂住 hibernated 标签页里的连接池。
 *  - `abort()` 后会立即换上一个新的 AbortController，transport 仍可继续被复用。
 *
 * Wraps `WorkflowChatTransport` with transport-level abort control + request
 * timeout:
 *  - `abort()` cancels every in-flight fetch through this transport, including
 *    AI SDK internal `reconnectToStream` calls (which don't pass a signal).
 *    Used for route teardown and as an iOS-stop fallback.
 *  - 8-minute client-side timeout per request, so a hibernated tab never holds
 *    sockets open indefinitely.
 *  - After `abort()` a fresh AbortController is installed so the same instance
 *    stays usable.
 */
export class AbortableWorkflowChatTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends WorkflowChatTransport<UI_MESSAGE> {
  private _state: { controller: AbortController };

  constructor(options: ConstructorParameters<typeof WorkflowChatTransport<UI_MESSAGE>>[0]) {
    const state = { controller: new AbortController() };
    const outerFetch: typeof fetch = options?.fetch ?? globalThis.fetch;

    super({
      ...options,
      fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => {
          timeoutController.abort("Chat request timed out after 8 minutes.");
        }, CHAT_REQUEST_TIMEOUT_MS);

        const signals: AbortSignal[] = [state.controller.signal, timeoutController.signal];
        if (init?.signal) {
          signals.push(init.signal);
        }

        const merged = AbortSignal.any(signals);
        const promise = outerFetch(input, { ...init, signal: merged });
        return promise.finally(() => clearTimeout(timeoutId));
      }) as typeof fetch,
    });

    this._state = state;
  }

  /**
   * 中断本 transport 上所有正在进行的 fetch（包含 reconnect），随后立即重置可继续使用。
   * Aborts every in-flight fetch through this transport (including reconnect),
   * then immediately resets so subsequent requests work normally.
   */
  abort(): void {
    this._state.controller.abort();
    this._state.controller = new AbortController();
  }
}
