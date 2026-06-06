import { AsyncLocalStorage } from "node:async_hooks";

const authRequestHeadersStore = new AsyncLocalStorage<Headers>();

// oxlint-disable-next-line promise/prefer-await-to-callbacks -- AsyncLocalStorage scopes values through Node's callback API.
export function runWithAuthRequestHeaders<T>(headers: Headers, callback: () => T): T {
  return authRequestHeadersStore.run(headers, callback);
}

export function getAuthRequestHeaders(): Headers | undefined {
  return authRequestHeadersStore.getStore();
}
