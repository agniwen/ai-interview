// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion, promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- This Promise compatibility boundary observes rejection timing while retaining tuple types after every operation settles.
export async function settleAllOrThrow<const T extends readonly Promise<unknown>[]>(
  operations: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  let firstFailure: unknown;
  let hasFailure = false;
  const tracked = operations.map((operation) =>
    operation.catch((error: unknown) => {
      if (!hasFailure) {
        firstFailure = error;
        hasFailure = true;
      }
      throw error;
    }),
  );
  const results = await Promise.allSettled(tracked);
  if (hasFailure) {
    throw firstFailure;
  }
  // SAFETY: every rejection returned above, so all remaining results are fulfilled in tuple order.
  return results.map((result) => (result.status === "fulfilled" ? result.value : undefined)) as {
    -readonly [K in keyof T]: Awaited<T[K]>;
  };
}
