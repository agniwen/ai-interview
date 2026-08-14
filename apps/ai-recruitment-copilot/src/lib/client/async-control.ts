export type AsyncResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      error: unknown;
      ok: false;
    };

export async function captureAsync<T>(operation: () => T | Promise<T>): Promise<AsyncResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { error, ok: false };
  }
}

export async function withCleanup<T>(
  operation: () => T | Promise<T>,
  cleanup: () => void,
): Promise<T> {
  try {
    return await operation();
  } finally {
    cleanup();
  }
}

export async function runAsyncAction<T>({
  cleanup,
  onError,
  operation,
}: {
  cleanup?: () => void;
  onError?: (error: unknown) => void;
  operation: () => T | Promise<T>;
}): Promise<AsyncResult<T>> {
  const result = await captureAsync(() =>
    cleanup ? withCleanup(operation, cleanup) : operation(),
  );
  if (!result.ok) {
    onError?.(result.error);
  }
  return result;
}
