import { Data, Effect, Exit, Scope } from "effect";

class WorkerFinalizerFailure extends Data.TaggedError("WorkerFinalizerFailure")<{
  readonly cause: unknown;
  readonly resource: string;
}> {}

export interface WorkerLifecycle {
  readonly addFinalizer: (resource: string, close: () => Promise<void> | void) => void;
  readonly close: (exit?: Exit.Exit<unknown, unknown>) => Promise<void>;
}

// Owns process resources in one Effect Scope. Scope closes finalizers in reverse acquisition order
// and still runs later finalizers when an earlier cleanup fails.
export function createWorkerLifecycle(
  onFinalizerFailure: (failure: { cause: unknown; resource: string }) => void,
): WorkerLifecycle {
  const scope = Scope.makeUnsafe("sequential");
  let closePromise: Promise<void> | undefined;
  const failures: WorkerFinalizerFailure[] = [];

  return {
    addFinalizer: (resource, close) => {
      Effect.runSync(
        Scope.addFinalizer(
          scope,
          Effect.tryPromise({
            catch: (cause) => new WorkerFinalizerFailure({ cause, resource }),
            try: () => Promise.resolve(close()),
          }).pipe(
            Effect.catchTag("WorkerFinalizerFailure", (failure) =>
              Effect.sync(() => {
                failures.push(failure);
                onFinalizerFailure({ cause: failure.cause, resource: failure.resource });
              }),
            ),
          ),
        ),
      );
    },
    close: (exit = Exit.void) => {
      closePromise ??= (async () => {
        await Effect.runPromise(Scope.close(scope, exit));
        if (exit._tag === "Success" && failures[0]) {
          throw failures[0].cause;
        }
      })();
      return closePromise;
    },
  };
}
