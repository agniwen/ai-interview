import { expect, vi } from "vitest";

/**
 * `@t3-oss/env-core` logs validation issues with `console.error` before throwing.
 * Negative tests intentionally pass incomplete env objects; silence that noise so
 * suite output is not mistaken for a missing local `.env`.
 */
export function expectEnvValidationToThrow(run: () => unknown): void {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(run).toThrow();
  } finally {
    errorSpy.mockRestore();
  }
}
