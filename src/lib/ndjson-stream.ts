/**
 * NDJSON（换行分隔的 JSON）流式解析工具。
 * NDJSON (newline-delimited JSON) streaming parser utility.
 *
 * 适合从一个 fetch Response 中边到达、边解析事件（例如 AI Token 流、Agent 增量输出）。
 * 解析过程是渐进式的：未解析完的行会保留在 buffer 中，等到换行符到达再处理。
 *
 * Useful for incrementally parsing events from a fetch Response (AI token streams,
 * agent deltas, etc.). Parsing is incremental — partial lines stay buffered until a
 * newline arrives.
 */

/**
 * 从 Response 中读取 NDJSON 流，对每个解析成功的事件调用 `onEvent`。
 * 解析失败的行会被静默忽略，保证整体流不被一行坏数据中断。
 *
 * Read an NDJSON stream from a Response, invoking `onEvent` for each successfully
 * parsed event. Malformed lines are silently skipped so a single bad line does not
 * abort the whole stream.
 *
 * @param response 调用 `fetch` 后的响应；其 body 必须可读 / The fetch response with a readable body.
 * @param onEvent  每解析一行成功的 JSON 时回调 / Callback invoked for each parsed event.
 * @param signal   可选取消信号 / Optional AbortSignal to bail out early.
 */
export async function readNdjsonStream<T = unknown>(
  response: Response,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is empty");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer.
      // 最后一行可能是半截，保留在 buffer 中等待下一段数据。
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        try {
          onEvent(JSON.parse(trimmed) as T);
        } catch {
          // skip malformed lines / 跳过解析失败的行
        }
      }
    }

    // Process any remaining content in the buffer.
    // 流结束后处理 buffer 中剩余的内容。
    if (buffer.trim()) {
      try {
        onEvent(JSON.parse(buffer.trim()) as T);
      } catch {
        // skip
      }
    }
  } finally {
    reader.releaseLock();
  }
}
