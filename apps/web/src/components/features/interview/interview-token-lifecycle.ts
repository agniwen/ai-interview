/** Keep SDK cleanup refreshes local after this interview has permanently ended. */
export function createInterviewTokenLifecycle<T>(requestToken: () => Promise<T>) {
  let ended = false;
  let lastToken: T | undefined;

  return {
    end() {
      ended = true;
    },
    async fetch() {
      if (ended) {
        if (lastToken === undefined) {
          throw new Error("interview has ended");
        }
        // useSession refreshes its cache on disconnect/end, even without reconnecting.
        // Returning the last credentials satisfies that refresh without signing again.
        return lastToken;
      }
      const token = await requestToken();
      lastToken = token;
      return token;
    },
  };
}
