import type { GetWorkflowResponse } from "@mastra/client-js";

const emptySchema = '{"type":"object"}';

const stepDef = (id: string) => ({
  description: "",
  id,
  inputSchema: emptySchema,
  outputSchema: emptySchema,
  resumeSchema: emptySchema,
  stateSchema: emptySchema,
  suspendSchema: emptySchema,
});

const allStepDef = (id: string) => ({
  ...stepDef(id),
  isWorkflow: false,
});

export const twoStepWorkflow: GetWorkflowResponse = {
  allSteps: {
    extract: allStepDef("extract"),
    transform: allStepDef("transform"),
  },
  inputSchema: emptySchema,
  name: "two-step-workflow",
  outputSchema: emptySchema,
  stateSchema: emptySchema,
  stepGraph: [
    { step: { description: "", id: "extract" }, type: "step" },
    { step: { description: "", id: "transform" }, type: "step" },
  ],
  steps: {
    extract: stepDef("extract"),
    transform: stepDef("transform"),
  },
};

// Mirrors the branch -> map join in the kitchen-sink complexWorkflow: a starting step,
// a conditional with two arms (short-text / long-text), a mapping step that joins both
// arms, then a final step. Only one arm runs at a time, so the per-step "next step"
// resolution must skip the arm that was never taken.
export const branchWorkflow: GetWorkflowResponse = {
  allSteps: {
    final: allStepDef("final"),
    "long-text": allStepDef("long-text"),
    mapping_join: allStepDef("mapping_join"),
    "short-text": allStepDef("short-text"),
    start: allStepDef("start"),
  },
  inputSchema: emptySchema,
  name: "branch-workflow",
  outputSchema: emptySchema,
  stateSchema: emptySchema,
  stepGraph: [
    { step: { description: "", id: "start" }, type: "step" },
    {
      serializedConditions: [
        { fn: "short", id: "cond-short" },
        { fn: "long", id: "cond-long" },
      ],
      steps: [
        { step: { description: "", id: "short-text" }, type: "step" },
        { step: { description: "", id: "long-text" }, type: "step" },
      ],
      type: "conditional",
    },
    { step: { id: "mapping_join", mapConfig: "() => {}" }, type: "step" },
    { step: { description: "", id: "final" }, type: "step" },
  ],
  steps: {
    final: stepDef("final"),
    "long-text": stepDef("long-text"),
    mapping_join: stepDef("mapping_join"),
    "short-text": stepDef("short-text"),
    start: stepDef("start"),
  },
};

// Mirrors the parallel -> map join in the kitchen-sink complexWorkflow: a starting step,
// a parallel entry with two arms (add-letter-b / add-letter-c), a mapping step that joins
// both arms, then a final step. Unlike a conditional, EVERY parallel arm must run, so the
// per-step "next step" resolution must NOT skip a still-idle sibling once the first arm
// has succeeded.
export const parallelWorkflow: GetWorkflowResponse = {
  allSteps: {
    "add-letter-b": allStepDef("add-letter-b"),
    "add-letter-c": allStepDef("add-letter-c"),
    final: allStepDef("final"),
    mapping_join: allStepDef("mapping_join"),
    start: allStepDef("start"),
  },
  inputSchema: emptySchema,
  name: "parallel-workflow",
  outputSchema: emptySchema,
  stateSchema: emptySchema,
  stepGraph: [
    { step: { description: "", id: "start" }, type: "step" },
    {
      steps: [
        { step: { description: "", id: "add-letter-b" }, type: "step" },
        { step: { description: "", id: "add-letter-c" }, type: "step" },
      ],
      type: "parallel",
    },
    { step: { id: "mapping_join", mapConfig: "() => {}" }, type: "step" },
    { step: { description: "", id: "final" }, type: "step" },
  ],
  steps: {
    "add-letter-b": stepDef("add-letter-b"),
    "add-letter-c": stepDef("add-letter-c"),
    final: stepDef("final"),
    mapping_join: stepDef("mapping_join"),
    start: stepDef("start"),
  },
};

// Mirrors the nested workflow in the kitchen-sink complexWorkflow: a starting step,
// a nested workflow step (component: 'WORKFLOW'), then a final step. A nested workflow is
// atomic from the parent's perspective, so advancing to it via "Run next step" must run it
// to completion (perStep disabled) instead of pausing after its first inner step.
export const nestedWorkflow: GetWorkflowResponse = {
  allSteps: {
    final: allStepDef("final"),
    "nested-text-processor": { ...stepDef("nested-text-processor"), isWorkflow: true },
    start: allStepDef("start"),
  },
  inputSchema: emptySchema,
  name: "nested-workflow",
  outputSchema: emptySchema,
  stateSchema: emptySchema,
  stepGraph: [
    { step: { description: "", id: "start" }, type: "step" },
    {
      step: {
        component: "WORKFLOW",
        description: "",
        id: "nested-text-processor",
        serializedStepFlow: [],
      },
      type: "step",
    },
    { step: { description: "", id: "final" }, type: "step" },
  ],
  steps: {
    final: stepDef("final"),
    "nested-text-processor": stepDef("nested-text-processor"),
    start: stepDef("start"),
  },
};
