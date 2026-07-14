import { renderHook } from "@testing-library/react";
import type { Edge } from "@xyflow/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { WorkflowRunContext } from "../../context/workflow-run-context";
import { useWorkflowGraphRuntime } from "../use-workflow-graph-runtime";
import { WORKFLOW_DATA_EDGE_TYPE } from "../workflow-data-edge";
import { WORKFLOW_BOUNDARY_NODE_TYPE } from "../workflow-step-node-utils";

const workflowRunContextValue = {
  debugMode: false,
  result: {
    status: "running",
    steps: {
      extract: {
        output: { customerId: "cus_123" },
        payload: { request: true },
        startedAt: Date.now(),
        status: "success",
      },
      transform: {
        payload: { customerId: "cus_123" },
        startedAt: Date.now(),
        status: "running",
      },
    },
  },
} as React.ComponentProps<typeof WorkflowRunContext.Provider>["value"];

const wrapper = ({ children }: PropsWithChildren) => (
  <WorkflowRunContext.Provider value={workflowRunContextValue}>
    {children}
  </WorkflowRunContext.Provider>
);

describe("useWorkflowGraphRuntime", () => {
  it("registers the workflow data edge type and applies it to workflow edges", () => {
    const edges: Edge[] = [
      {
        data: { nextStepId: "transform", previousStepId: "extract" },
        id: "e-extract-transform",
        source: "extract",
        target: "transform",
      },
    ];

    const { result } = renderHook(() => useWorkflowGraphRuntime({ edges }), { wrapper });

    expect(result.current.edgeTypes[WORKFLOW_DATA_EDGE_TYPE]).toEqual(expect.any(Function));
    expect(result.current.nodeTypes[WORKFLOW_BOUNDARY_NODE_TYPE]).toEqual(expect.any(Function));
    expect(result.current.styledEdges[0].type).toBe(WORKFLOW_DATA_EDGE_TYPE);
  });

  it("renders unfinished edges in gray instead of the default white stroke", () => {
    const edges: Edge[] = [
      {
        data: { nextStepId: "load", previousStepId: "transform" },
        id: "e-transform-load",
        source: "transform",
        target: "load",
      },
    ];

    const { result } = renderHook(() => useWorkflowGraphRuntime({ edges }), { wrapper });

    expect(result.current.styledEdges[0].style?.stroke).toBe("#8e8e8e");
    expect(result.current.styledEdges[0].data?.edgeStatus).toBe("idle");
  });

  it("renders finished green edges as solid instead of animated", () => {
    const edges: Edge[] = [
      {
        animated: true,
        data: { nextStepId: "transform", previousStepId: "extract" },
        id: "e-extract-transform",
        source: "extract",
        style: { strokeDasharray: "5 5" },
        target: "transform",
      },
    ];

    const { result } = renderHook(() => useWorkflowGraphRuntime({ edges }), { wrapper });

    expect(result.current.styledEdges[0].style?.stroke).toBe("#22c55e");
    expect(result.current.styledEdges[0].style?.strokeDasharray).toBe("none");
    expect(result.current.styledEdges[0].animated).toBe(false);
    expect(result.current.styledEdges[0].data?.edgeStatus).toBe("success");
  });

  it("does not light the conditional edge of a skipped branch arm", () => {
    // After a conditional resolves, the un-taken arm is persisted as `skipped`. Its incoming
    // condition edge must stay idle (grey) so the graph does not show the wrong branch as taken.
    const conditionalContext = {
      debugMode: false,
      result: {
        status: "paused",
        steps: {
          "long-text": {
            output: { text: "HELLOABHELLOAC" },
            startedAt: Date.now(),
            status: "success",
          },
          "short-text": { startedAt: Date.now(), status: "skipped" },
        },
      },
    } as React.ComponentProps<typeof WorkflowRunContext.Provider>["value"];

    const conditionalWrapper = ({ children }: PropsWithChildren) => (
      <WorkflowRunContext.Provider value={conditionalContext}>
        {children}
      </WorkflowRunContext.Provider>
    );

    const edges: Edge[] = [
      {
        data: { conditionNode: true, nextStepId: "short-text" },
        id: "e-condition-short-text",
        source: "condition",
        target: "short-text",
      },
      {
        data: { conditionNode: true, nextStepId: "long-text" },
        id: "e-condition-long-text",
        source: "condition",
        target: "long-text",
      },
    ];

    const { result } = renderHook(() => useWorkflowGraphRuntime({ edges }), {
      wrapper: conditionalWrapper,
    });

    const shortEdge = result.current.styledEdges.find(
      (edge) => edge.id === "e-condition-short-text",
    );
    const longEdge = result.current.styledEdges.find((edge) => edge.id === "e-condition-long-text");

    expect(shortEdge?.data?.edgeStatus).toBe("idle");
    expect(longEdge?.data?.edgeStatus).toBe("success");
  });

  it("keeps the workflow-input boundary edge idle before the first step starts", () => {
    const idleContext = {
      debugMode: false,
      result: {
        status: "running",
        steps: {},
      },
    } as React.ComponentProps<typeof WorkflowRunContext.Provider>["value"];

    const idleWrapper = ({ children }: PropsWithChildren) => (
      <WorkflowRunContext.Provider value={idleContext}>{children}</WorkflowRunContext.Provider>
    );

    const edges: Edge[] = [
      {
        data: { boundaryPayload: "workflow-input", nextStepId: "add-letter" },
        id: "e-__workflow-start__-add-letter",
        source: "__workflow-start__",
        target: "add-letter",
      },
    ];

    const { result } = renderHook(() => useWorkflowGraphRuntime({ edges }), {
      wrapper: idleWrapper,
    });

    expect(result.current.styledEdges[0].data?.edgeStatus).toBe("idle");
    expect(result.current.styledEdges[0].style?.stroke).toBe("#8e8e8e");
  });

  it("lights the workflow-input boundary edge green once the first step starts", () => {
    const edges: Edge[] = [
      {
        animated: true,
        data: { boundaryPayload: "workflow-input", nextStepId: "transform" },
        id: "e-__workflow-start__-transform",
        source: "__workflow-start__",
        style: { strokeDasharray: "5 5" },
        target: "transform",
      },
    ];

    const { result } = renderHook(() => useWorkflowGraphRuntime({ edges }), { wrapper });

    expect(result.current.styledEdges[0].data?.edgeStatus).toBe("success");
    expect(result.current.styledEdges[0].style?.stroke).toBe("#22c55e");
    expect(result.current.styledEdges[0].style?.strokeDasharray).toBe("none");
    expect(result.current.styledEdges[0].animated).toBe(false);
  });

  it("keeps the workflow-input boundary edge idle for a skipped first step", () => {
    const skippedContext = {
      debugMode: false,
      result: {
        status: "running",
        steps: {
          "add-letter": { startedAt: Date.now(), status: "skipped" },
        },
      },
    } as React.ComponentProps<typeof WorkflowRunContext.Provider>["value"];

    const skippedWrapper = ({ children }: PropsWithChildren) => (
      <WorkflowRunContext.Provider value={skippedContext}>{children}</WorkflowRunContext.Provider>
    );

    const edges: Edge[] = [
      {
        data: { boundaryPayload: "workflow-input", nextStepId: "add-letter" },
        id: "e-__workflow-start__-add-letter",
        source: "__workflow-start__",
        target: "add-letter",
      },
    ];

    const { result } = renderHook(() => useWorkflowGraphRuntime({ edges }), {
      wrapper: skippedWrapper,
    });

    expect(result.current.styledEdges[0].data?.edgeStatus).toBe("idle");
    expect(result.current.styledEdges[0].style?.stroke).toBe("#8e8e8e");
  });

  it("keeps the workflow-output boundary edge idle until the run succeeds", () => {
    // The boundary edge into the End node carries no step ids, so it cannot rely on a
    // predecessor step. It should only light once the whole run reaches `success`.
    const edges: Edge[] = [
      {
        data: { boundaryPayload: "workflow-output" },
        id: "e-final-step-__workflow-end__",
        source: "final-step",
        target: "__workflow-end__",
      },
    ];

    const { result } = renderHook(() => useWorkflowGraphRuntime({ edges }), { wrapper });

    expect(result.current.styledEdges[0].data?.edgeStatus).toBe("idle");
  });

  it("lights the workflow-output boundary edge green once the run succeeds", () => {
    const successContext = {
      debugMode: false,
      result: {
        result: { output: true },
        status: "success",
        steps: {
          "final-step": { output: { output: true }, startedAt: Date.now(), status: "success" },
        },
      },
    } as React.ComponentProps<typeof WorkflowRunContext.Provider>["value"];

    const successWrapper = ({ children }: PropsWithChildren) => (
      <WorkflowRunContext.Provider value={successContext}>{children}</WorkflowRunContext.Provider>
    );

    const edges: Edge[] = [
      {
        data: { boundaryPayload: "workflow-output" },
        id: "e-final-step-__workflow-end__",
        source: "final-step",
        target: "__workflow-end__",
      },
    ];

    const { result } = renderHook(() => useWorkflowGraphRuntime({ edges }), {
      wrapper: successWrapper,
    });

    expect(result.current.styledEdges[0].data?.edgeStatus).toBe("success");
    expect(result.current.styledEdges[0].style?.stroke).toBe("#22c55e");
  });
});
