import { MastraReactProvider } from "@mastra/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStoredWorkspaces } from "../use-stored-workspaces";
import { server } from "@/test/msw-server";

const BASE_URL = "http://localhost:4111";

const wrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <MastraReactProvider baseUrl={BASE_URL}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MastraReactProvider>
  );
};

describe("useStoredWorkspaces", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists stored workspaces and forwards pagination + authorId params", async () => {
    let receivedUrl: URL | undefined;
    server.use(
      http.get(`${BASE_URL}/api/stored/workspaces`, ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json({
          hasMore: false,
          page: 2,
          perPage: 10,
          total: 1,
          workspaces: [{ createdAt: "", id: "ws-1", name: "WS", status: "active", updatedAt: "" }],
        });
      }),
    );

    const { result } = renderHook(
      () => useStoredWorkspaces({ authorId: "me", page: 2, perPage: 10 }),
      {
        wrapper: wrapper(),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.workspaces).toHaveLength(1);
    expect(receivedUrl?.searchParams.get("page")).toBe("2");
    expect(receivedUrl?.searchParams.get("perPage")).toBe("10");
    expect(receivedUrl?.searchParams.get("authorId")).toBe("me");
  });

  it("does not run when enabled is false", async () => {
    const onFetch = vi.fn();
    server.use(
      http.get(`${BASE_URL}/api/stored/workspaces`, () => {
        onFetch();
        return HttpResponse.json({
          hasMore: false,
          page: 1,
          perPage: 50,
          total: 0,
          workspaces: [],
        });
      }),
    );

    const { result } = renderHook(() => useStoredWorkspaces(undefined, { enabled: false }), {
      wrapper: wrapper(),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onFetch).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });
});
