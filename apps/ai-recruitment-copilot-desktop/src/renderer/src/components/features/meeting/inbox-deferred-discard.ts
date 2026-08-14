const TOAST_EXIT_DURATION_MS = 400;

export function createDeferredInboxDiscard(input: {
  commit: () => Promise<void>;
  onError?: (error: unknown) => void;
}) {
  let cancelled = false;
  let commitTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    afterToastDismissed() {
      if (cancelled || commitTimer) {
        return;
      }
      commitTimer = setTimeout(async () => {
        if (cancelled) {
          return;
        }
        try {
          await input.commit();
        } catch (error) {
          if (input.onError) {
            input.onError(error);
          }
        }
      }, TOAST_EXIT_DURATION_MS);
    },
    undo() {
      cancelled = true;
      if (commitTimer) {
        clearTimeout(commitTimer);
        commitTimer = null;
      }
    },
  };
}
