// @vitest-environment jsdom
import type { WorkflowRunState } from "@mastra/core/workflows";
import { cleanup, render, screen } from "@testing-library/react";
import { Route, Routes, MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkflowRunContext } from "../../context/workflow-run-context";
import { WorkflowSuspendedOverlay } from "../workflow-suspended-overlay";
import { twoStepWorkflow } from "./fixtures/workflow-debug-step-controls";

afterEach(() => cleanup());

type ContextValue = React.ComponentProps<typeof WorkflowRunContext.Provider>["value"];

const suspendedResult = {
  input: { request: true },
  status: "suspended",
  steps: {
    extract: {
      endedAt: Date.now(),
      output: { customerId: "cus_123" },
      payload: { request: true },
      startedAt: Date.now(),
      status: "success",
    },
    transform: {
      payload: { request: true },
      startedAt: Date.now(),
      status: "suspended",
      suspendPayload: { question: "continue?" },
      suspendedAt: Date.now(),
    },
  },
  suspendPayload: { question: "continue?" },
  suspended: [["transform"]],
} as ContextValue["result"];

const snapshot = (status: WorkflowRunState["status"]): WorkflowRunState => ({
  activePaths: [],
  activeStepsPath: {},
  context: {},
  resumeLabels: {},
  runId: "run-1",
  serializedStepGraph: [],
  status,
  suspendedPaths: {},
  timestamp: Date.now(),
  value: {},
  waitingPaths: {},
});

const buildContext = (overrides: Partial<ContextValue> = {}): ContextValue =>
  ({
    createWorkflowRun: vi.fn().mockResolvedValue({ runId: "run-2" }),
    isStreamingWorkflow: false,
    result: suspendedResult,
    resumeWorkflow: vi.fn().mockResolvedValue(),
    runId: "run-1",
    runSnapshot: snapshot("suspended"),
    workflow: twoStepWorkflow,
    workflowId: "two-step-workflow",
    ...overrides,
  }) as ContextValue;

// `route` is the URL the overlay renders under. A path of `/graph/:runId` makes
// `useParams().runId` resolve to a value (the :runId page); `/graph` leaves it undefined
// (the live graph page).
const renderOverlay = (value: ContextValue, route: string) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route
          path="/workflows/:workflowId/graph/:runId"
          element={
            <WorkflowRunContext.Provider value={value}>
              <WorkflowSuspendedOverlay />
            </WorkflowRunContext.Provider>
          }
        />
        <Route
          path="/workflows/:workflowId/graph"
          element={
            <WorkflowRunContext.Provider value={value}>
              <WorkflowSuspendedOverlay />
            </WorkflowRunContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe("WorkflowSuspendedOverlay", () => {
  it("shows the suspend dialog for a live suspended run on the graph page (no route runId)", () => {
    renderOverlay(buildContext(), "/workflows/two-step-workflow/graph");
    expect(screen.getByTestId("workflow-suspended-overlay")).not.toBeNull();
  });

  it("shows the suspend dialog on the :runId page when the stored snapshot is already suspended", () => {
    renderOverlay(buildContext(), "/workflows/two-step-workflow/graph/run-1");
    expect(screen.getByTestId("workflow-suspended-overlay")).not.toBeNull();
  });

  it("shows the suspend dialog on the :runId page when the live result suspends but the snapshot still lags as paused", () => {
    // BUG LOCK: step-by-step on the run page can suspend the live run before the per-run
    // snapshot refetches. The stale snapshot still says 'paused', but the live result is
    // 'suspended', so the overlay must surface off the live result — otherwise the
    // human-in-the-loop resume dialog never appears on the :runId page.
    renderOverlay(
      buildContext({ runSnapshot: snapshot("paused") }),
      "/workflows/two-step-workflow/graph/run-1",
    );
    expect(screen.getByTestId("workflow-suspended-overlay")).not.toBeNull();
  });

  it("hides the dialog on the :runId page when neither the snapshot nor the live result is suspended", () => {
    renderOverlay(
      buildContext({
        result: { ...suspendedResult, status: "success" } as ContextValue["result"],
        runSnapshot: snapshot("success"),
      }),
      "/workflows/two-step-workflow/graph/run-1",
    );
    expect(screen.queryByTestId("workflow-suspended-overlay")).toBeNull();
  });

  it("hides the dialog while the run is actively streaming", () => {
    renderOverlay(
      buildContext({ isStreamingWorkflow: true }),
      "/workflows/two-step-workflow/graph",
    );
    expect(screen.queryByTestId("workflow-suspended-overlay")).toBeNull();
  });
});
