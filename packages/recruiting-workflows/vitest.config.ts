import { defineConfig } from "vitest/config";

// Invite tokens are signed with BETTER_AUTH_SECRET; tests use the same placeholder as the Server suite.
process.env.BETTER_AUTH_SECRET ||= "test-only-backend-vitest-secret";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
