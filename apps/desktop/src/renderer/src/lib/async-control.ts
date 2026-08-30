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
