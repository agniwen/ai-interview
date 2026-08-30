// @vitest-environment jsdom
import { createMemoryHistory } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// This integration test imports the complete desktop route tree.
it(
  "masks recruitment detail navigation, preserves history, and unmasks after reload",
  { timeout: 15_000 },
  async () => {
    vi.stubEnv("VITE_BASE_URL", "http://localhost:5173");
    vi.stubEnv("VITE_BETTER_AUTH_URL", "http://localhost:8787");
    vi.stubGlobal("api", {
      meetingCapture: {
        listLocalSessions: () => Promise.resolve([]),
        recover: () => Promise.resolve([]),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            session: { expiresAt: "2099-01-01T00:00:00Z", id: "session", userId: "user" },
            user: { email: "test@example.com", id: "user", name: "Test" },
          }),
        ),
      ),
    );
    const { createDesktopRouter } = await import("./router");
    const client = new QueryClient();
    const history = createMemoryHistory({ initialEntries: ["/recruitment"] });
    const router = createDesktopRouter(client);
    router.update({ context: { queryClient: client }, history });
    try {
      await router.load();
      await router.navigate({
        params: { recordId: "record-1" },
        resetScroll: false,
        to: "/recruitment/overlay/$recordId",
      });
      expect(router.state.location.pathname).toBe("/recruitment/overlay/record-1");
      expect(history.location.pathname).toBe("/resumes/record-1");
      expect(router.state.matches.map((match) => match.routeId)).toContain("/_app/recruitment");

      history.back();
      await router.load();
      expect(router.state.location.pathname).toBe("/recruitment");
      history.forward();
      await router.load();
      expect(router.state.location.pathname).toBe("/recruitment/overlay/record-1");

      const reloaded = createDesktopRouter(client);
      reloaded.update({ context: { queryClient: client }, history });
      await reloaded.load();
      expect(reloaded.state.location.pathname).toBe("/resumes/record-1");
      expect(reloaded.state.matches.map((match) => match.routeId)).not.toContain(
        "/_app/recruitment",
      );
    } finally {
      client.clear();
      history.destroy();
    }
  },
);
