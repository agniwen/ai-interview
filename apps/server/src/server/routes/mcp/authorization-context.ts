import { AsyncLocalStorage } from "node:async_hooks";

interface McpAuthorizationContext {
  grantId: string;
  userId: string;
}

const authorizationStore = new AsyncLocalStorage<McpAuthorizationContext>();

export function getMcpAuthorizationContext() {
  return authorizationStore.getStore();
}

// oxlint-disable-next-line promise/prefer-await-to-callbacks -- AsyncLocalStorage provides request-local authorization, never shared session state.
export function runWithMcpAuthorization<T>(context: McpAuthorizationContext, run: () => T): T {
  return authorizationStore.run(context, run);
}
