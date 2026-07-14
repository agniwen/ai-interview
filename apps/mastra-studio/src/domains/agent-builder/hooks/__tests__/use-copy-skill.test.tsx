import { MastraReactProvider } from "@mastra/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCopySkill } from "../use-copy-skill";
import { makeStoredSkill } from "./fixtures/stored-skills";
import { server } from "@/test/msw-server";

vi.mock("@mastra/playground-ui/utils/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const BASE_URL = "http://localhost:4111";

const makeHarness = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MastraReactProvider baseUrl={BASE_URL}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MastraReactProvider>
  );
  return { Wrapper, queryClient };
};

describe("useCopySkill", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a private copy with library-copy origin metadata", async () => {
    const source = makeStoredSkill({
      authorId: "author-1",
      description: "Original",
      id: "src-1",
      instructions: "Do it",
      name: "Source Skill",
      visibility: "public",
    });

    let receivedBody: any = null;
    server.use(
      http.post(`${BASE_URL}/api/stored/skills`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(makeStoredSkill({ id: "copy-1", name: "My Copy" }));
      }),
    );

    const { queryClient, Wrapper } = makeHarness();
    queryClient.setQueryData(["stored-skills"], { skills: [], total: 0 });

    const { result } = renderHook(() => useCopySkill(), { wrapper: Wrapper });

    const created = await result.current.mutateAsync({ name: "My Copy", source });

    expect(created.id).toBe("copy-1");
    await waitFor(() => expect(receivedBody).not.toBeNull());

    expect(receivedBody).toMatchObject({
      description: "Original",
      instructions: "Do it",
      metadata: {
        origin: {
          sourceAuthorId: "author-1",
          sourceSkillId: "src-1",
          sourceSkillName: "Source Skill",
          type: "library-copy",
        },
      },
      name: "My Copy",
      visibility: "private",
    });
    expect(receivedBody.metadata.origin.copiedAt).toEqual(expect.any(String));

    expect(queryClient.getQueryState(["stored-skills"])?.isInvalidated).toBe(true);
  });

  it("omits null license and files from the create payload", async () => {
    const source = makeStoredSkill({
      files: null as any,
      id: "src-2",
      license: null as any,
    });

    let receivedBody: any = null;
    server.use(
      http.post(`${BASE_URL}/api/stored/skills`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(makeStoredSkill({ id: "copy-2" }));
      }),
    );

    const { Wrapper } = makeHarness();
    const { result } = renderHook(() => useCopySkill(), { wrapper: Wrapper });

    await result.current.mutateAsync({ name: "Copy", source });

    expect(receivedBody).not.toHaveProperty("license");
    expect(receivedBody).not.toHaveProperty("files");
  });
});
