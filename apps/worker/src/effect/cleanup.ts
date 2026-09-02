// oxlint-disable anti-slop/no-unknown-parameters -- Cleanup boundaries must retain arbitrary third-party causes without rewriting them.
import { Cause, Effect } from "effect";

export async function cleanupPreservingPrimary(input: {
  readonly cleanup: () => Promise<void>;
  readonly hasPrimaryFailure: boolean;
  readonly onCleanupFailure: (cause: unknown) => void;
  readonly primaryCause: unknown;
}): Promise<void> {
  const outcome = await Effect.runPromise(
    Effect.tryPromise({ catch: (cause) => cause, try: input.cleanup }).pipe(Effect.exit),
  );
  if (outcome._tag === "Success") {
    return;
  }
  const reason = outcome.cause.reasons.find(Cause.isFailReason);
  if (!reason) {
    return await Effect.runPromise(Effect.failCause(outcome.cause));
  }
  input.onCleanupFailure(reason.error);
  if (!input.hasPrimaryFailure) {
    throw reason.error;
  }
}
