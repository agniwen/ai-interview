import type { BackendEnvironmentKey } from "./backend-environment.schema.js";

export type RawBackendEnvironment = Readonly<Record<BackendEnvironmentKey, string | undefined>>;

/**
 * Compatibility boundary for copied domain code that intentionally preserves
 * legacy raw-string environment semantics during the parity migration.
 */
// The schema-derived key union constrains consumers while the live reference
// keeps test and runtime mutations visible.
// SAFETY: Node exposes every environment entry as string | undefined.
const liveProcessEnvironment = process.env as RawBackendEnvironment;

export const rawBackendEnvironment = liveProcessEnvironment;
