// @vitest-environment jsdom

import type { JobDescriptionRecord } from "@arc/shared/job-descriptions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JobDescriptionHoverCard } from "./job-description-hover-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rpcGetMock = vi.hoisted(() => vi.fn(() => Promise.resolve(new Response())));
const rpcFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/client/api", () => ({ rpcFetch: rpcFetchMock }));
vi.mock("@/lib/client/rpc", () => ({
  rpc: {
    api: {
      w: {
        ":slug": {
          studio: {
            "job-descriptions": {
              ":id": { $get: rpcGetMock },
            },
          },
        },
      },
    },
  },
}));
vi.mock("@/lib/client/workspace-context", () => ({
  useOptionalWorkspaceSlug: () => "demo",
}));

const record = {
  code: "DEV0001",
  description: "负责产品前端研发",
  id: "job-1",
  interviewerIds: ["interviewer-1"],
  name: "前端工程师",
  prompt: "熟悉 **React** 与 TypeScript",
} as JobDescriptionRecord;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("JobDescriptionHoverCard", () => {
  it("loads job details only after the preview opens", async () => {
    rpcFetchMock.mockResolvedValue(record);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <JobDescriptionHoverCard jobDescriptionId="job-1" name="前端工程师" />
        </QueryClientProvider>,
      );
    });

    expect(rpcFetchMock).not.toHaveBeenCalled();
    const trigger = host.querySelector("button");
    expect(trigger?.className).not.toMatch(/(^|\s)underline(\s|$)/);
    expect(trigger?.className).toContain("hover:underline");

    act(() => {
      trigger?.click();
    });

    await vi.waitFor(() => {
      expect(rpcFetchMock).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).toContain("负责产品前端研发");
      const scrollAreas = document.body.querySelectorAll('[data-slot="scroll-area"]');
      expect(scrollAreas).toHaveLength(2);
      expect(scrollAreas[0]?.classList).toContain("[--scroll-fade-reveal:1rem]");
      for (const scrollArea of scrollAreas) {
        expect(scrollArea.firstElementChild?.classList).toContain("scroll-fade");
      }
      expect(document.body.querySelector("strong")?.textContent).toBe("React");
    });

    act(() => root.unmount());
  });
});
