// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { Route as parentRoute } from "./w.$slug.studio.offer-approval-templates";
import { Route as newRoute } from "./w.$slug.studio.offer-approval-templates.new";
import { Route as editRoute } from "./w.$slug.studio.offer-approval-templates.$templateId";

// SAFETY: React's test environment flag accepts a boolean.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("审批模板独立编辑页面", () => {
  it.each([
    ["new", "新建审批模板", ""],
    ["template-1", "编辑审批模板", "标准审批"],
    ["missing", "审批模板不存在", null],
  ])("opens %s directly without rendering a dialog or list", async (segment, heading, name) => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.stubGlobal("matchMedia", (media: string) =>
      Object.assign(new EventTarget(), { matches: false, media }),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        targets = new Set<Element>();
        observe(target: Element) {
          this.targets.add(target);
        }
        unobserve(target: Element) {
          this.targets.delete(target);
        }
        disconnect() {
          this.targets.clear();
        }
      },
    );
    vi.stubGlobal("fetch", (input: RequestInfo | URL) =>
      Promise.resolve(
        Response.json(
          String(input).includes("template-approvers")
            ? []
            : [
                {
                  id: "template-1",
                  enabled: true,
                  name: "标准审批",
                  nodes: [{ id: "node-1", fixedUserId: null, resolverType: "recruiting_owner" }],
                },
              ],
        ),
      ),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rootRoute = createRootRoute();
    const parent = createRoute({
      component: parentRoute.options.component,
      getParentRoute: () => rootRoute,
      path: "/w/$slug/studio/offer-approval-templates",
    });
    const create = createRoute({
      component: newRoute.options.component,
      getParentRoute: () => parent,
      path: "new",
    });
    const edit = createRoute({
      component: editRoute.options.component,
      getParentRoute: () => parent,
      path: "$templateId",
    });
    const router = createRouter({
      history: createMemoryHistory({
        initialEntries: [`/w/acme/studio/offer-approval-templates/${segment}`],
      }),
      routeTree: rootRoute.addChildren([parent.addChildren([create, edit])]),
    });
    await router.load();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <WorkspaceSlugProvider
              id="org"
              memberRole="admin"
              permissions={{ offerApproval: ["manage"] }}
              slug="acme"
            >
              <RouterProvider router={router} />
            </WorkspaceSlugProvider>
          </QueryClientProvider>,
        );
        await delay(20);
      });
      await act(async () => {
        await delay(20);
      });
      await vi.waitFor(async () => {
        await act(async () => {
          await delay(20);
        });
        expect(host.querySelector("h1")?.textContent).toBe(heading);
      });
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      expect(host.querySelector("table")).toBeNull();
      if (name !== null) {
        expect(host.querySelector<HTMLInputElement>("#approval-template-name")?.value).toBe(name);
        expect(host.textContent).toContain("保存模板");
        expect(host.querySelector('a[href="/w/acme/studio/offer-approval-templates"]')).toBeNull();
      }
    } finally {
      act(() => root.unmount());
      host.remove();
      client.clear();
    }
  });
});
