import { TooltipProvider } from "@mastra/playground-ui/components/Tooltip";
import { MastraReactProvider } from "@mastra/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentBuilderFavoritePage from "..";
import { LinkComponentProvider } from "@/lib/framework";
import { server } from "@/test/msw-server";
vi.mock("@mastra/playground-ui/store/playground-store", () => ({
  usePlaygroundStore: () => ({ requestContext: undefined }),
}));

vi.mock("@mastra/playground-ui/utils/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const BASE_URL = "http://localhost:4111";

const StubLink = ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a {...props}>{children}</a>
);

const noopPaths = {
  agentBuilderLink: () => "",
  agentLink: () => "",
  agentMessageLink: () => "",
  datasetExperimentLink: () => "",
  datasetItemLink: () => "",
  datasetLink: () => "",
  experimentLink: () => "",
  legacyWorkflowLink: () => "",
  mcpServerLink: () => "",
  mcpServerToolLink: () => "",
  policyLink: () => "",
  promptLink: () => "",
  scoreLink: () => "",
  scorerLink: () => "",
  toolByAgentLink: () => "",
  toolByWorkflowLink: () => "",
  toolLink: () => "",
  vNextNetworkLink: () => "",
  workflowLink: () => "",
  workflowRunLink: () => "",
} as never;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <MastraReactProvider baseUrl={BASE_URL}>
      <QueryClientProvider client={queryClient}>
        <LinkComponentProvider Link={StubLink as never} navigate={() => {}} paths={noopPaths}>
          <MemoryRouter>
            <TooltipProvider>
              <AgentBuilderFavoritePage />
            </TooltipProvider>
          </MemoryRouter>
        </LinkComponentProvider>
      </QueryClientProvider>
    </MastraReactProvider>,
  );
}

const baseAgent = {
  authorId: "user-1",
  createdAt: new Date().toISOString(),
  favoriteCount: 1,
  instructions: "",
  isFavorited: true,
  model: { name: "gpt-4", provider: "openai" },
  status: "draft" as const,
  updatedAt: new Date().toISOString(),
  visibility: "private" as const,
};

describe("AgentBuilderFavoritePage", () => {
  beforeEach(() => {
    server.use(
      http.get(`${BASE_URL}/api/auth/capabilities`, () =>
        HttpResponse.json({ enabled: false, login: null }),
      ),
      http.get(`${BASE_URL}/api/auth/me`, () => HttpResponse.json({ id: "user-1" })),
      http.get(`${BASE_URL}/api/editor/builder/settings`, () => HttpResponse.json({})),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("passes favoritedOnly=true and updatedAt descending order to the API without a status filter", async () => {
    let capturedSearch: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE_URL}/api/stored/agents`, ({ request }) => {
        capturedSearch = new URL(request.url).searchParams;
        return HttpResponse.json({
          agents: [
            { ...baseAgent, description: "Alpha desc", id: "fav-1", name: "Favorite Alpha" },
          ],
          hasMore: false,
          page: 1,
          perPage: 100,
          total: 1,
        });
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(capturedSearch).not.toBeNull();
    });
    expect(capturedSearch!.get("favoritedOnly")).toBe("true");
    expect(capturedSearch!.get("orderBy[field]")).toBe("updatedAt");
    expect(capturedSearch!.get("orderBy[direction]")).toBe("DESC");
    expect(capturedSearch!.get("status")).toBeNull();
  });

  it("renders rows from the response with view links", async () => {
    server.use(
      http.get(`${BASE_URL}/api/stored/agents`, () =>
        HttpResponse.json({
          agents: [
            { ...baseAgent, description: "Alpha desc", id: "fav-1", name: "Favorite Alpha" },
            { ...baseAgent, description: "Beta desc", id: "fav-2", name: "Favorite Beta" },
          ],
          hasMore: false,
          page: 1,
          perPage: 100,
          total: 2,
        }),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Favorite Alpha")).toBeTruthy();
    });
    expect(screen.getByText("Favorite Beta")).toBeTruthy();

    const rows = screen.getAllByTestId("favorite-agent-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("href")).toBe("/agent-builder/agents/fav-1/view");
    expect(rows[1].getAttribute("href")).toBe("/agent-builder/agents/fav-2/view");
  });

  it("shows the empty state when the API returns no agents", async () => {
    server.use(
      http.get(`${BASE_URL}/api/stored/agents`, () =>
        HttpResponse.json({ agents: [], hasMore: false, page: 1, perPage: 100, total: 0 }),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No favorite agents yet")).toBeTruthy();
    });
    expect(screen.queryByTestId("favorite-agent-row")).toBeNull();
  });

  it("shows the error state when the API returns 500", async () => {
    server.use(
      http.get(`${BASE_URL}/api/stored/agents`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load favorite agents")).toBeTruthy();
    });
  });
});
