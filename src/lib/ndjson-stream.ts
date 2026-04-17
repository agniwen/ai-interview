/**
 * Read a NDJSON (newline-delimited JSON) stream from a fetch Response,
 * invoking a callback for each parsed event.
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
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        try {
          onEvent(JSON.parse(trimmed) as T);
        } catch {
          // skip malformed lines
        }
      }
    }

    // Process any remaining content in the buffer
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
