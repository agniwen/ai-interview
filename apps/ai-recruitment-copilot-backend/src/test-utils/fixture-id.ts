/**
 * Build collision-resistant fixture IDs for parallel Vitest workers.
 *
 * Backend integration tests share one Postgres. Parallel forks are safe only when
 * rows/keys from different workers never collide (fixed ids like "test_org"
 * will race). Prefer this helper over hard-coded fixture constants.
 */
export function createFixtureNamespace(label: string): string {
  const worker =
    process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? process.pid.toString(36);
  const salt = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  // Keep identifiers short enough for typical text PK / slug columns.
  return `${label}_w${worker}_${salt}`.replaceAll(/[^a-zA-Z0-9_]/g, "_").slice(0, 48);
}
