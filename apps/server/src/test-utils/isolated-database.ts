/**
 * Whether DATABASE_URL is the explicitly configured isolated recruiting test database.
 *
 * Suites whose assertions need exclusive ownership of shared queues/outboxes (lease claims,
 * notification fan-out) must run only here: the default DATABASE_URL may be shared with a running
 * deployment whose background schedulers claim the same rows. A configured but mismatched
 * isolated database fails loudly instead of silently skipping.
 */
export function usesIsolatedTestDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  const testUrl = env.RECRUITING_TEST_DATABASE_URL;
  if (!testUrl) {
    return false;
  }
  if (env.DATABASE_URL !== testUrl || !new URL(testUrl).pathname.includes("_test_")) {
    throw new Error("必须显式配置隔离招聘测试库");
  }
  return true;
}
