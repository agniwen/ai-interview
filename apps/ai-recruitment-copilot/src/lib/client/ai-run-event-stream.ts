/**
 * Read the project's AI run event stream.
 *
 * The backend sends Server-Sent Event frames shaped as:
 *   event: ai-run
 *   data: {...AiRunEvent}
 */
export async function readAiRunEventStream<T = unknown>(
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

  const parseFrame = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    if (!data) {
      return;
    }
    try {
      onEvent(JSON.parse(data) as T);
    } catch {
      // Ignore malformed frames so one bad event does not abort the stream.
    }
  };

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
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        parseFrame(frame.trim());
      }
    }

    if (buffer.trim()) {
      parseFrame(buffer.trim());
    }
  } finally {
    reader.releaseLock();
  }
}
