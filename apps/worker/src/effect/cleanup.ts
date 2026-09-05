// oxlint-disable anti-slop/no-unknown-parameters -- Cleanup boundaries must retain arbitrary third-party causes without rewriting them.
export async function cleanupPreservingPrimary(input: {
  readonly cleanup: () => Promise<void>;
  readonly hasPrimaryFailure: boolean;
  readonly onCleanupFailure: (cause: unknown) => void;
}): Promise<void> {
  try {
    await input.cleanup();
  } catch (error) {
    input.onCleanupFailure(error);
    if (!input.hasPrimaryFailure) {
      throw error;
    }
  }
}
