export type CandidateActionId =
  | "advance-pipeline"
  | "review-node"
  | "reset-ai-round"
  | "close-candidate"
  | "reopen-candidate"
  | "schedule-interview"
  | "launch-ai-interview"
  | "interview-questions";

export interface DockState {
  active: CandidateActionId | null;
  feedback?: string;
}
export type DockEvent =
  | { type: "enter"; id: CandidateActionId }
  | { type: "leave"; id: CandidateActionId }
  | { type: "complete"; id: CandidateActionId; message: string }
  | { type: "clear-feedback" };

export function dockReducer(state: DockState, event: DockEvent): DockState {
  if (event.type === "clear-feedback") {
    return { active: state.active };
  }
  if (event.type === "complete") {
    return state.active === event.id ? { active: null, feedback: event.message } : state;
  }
  if (event.type === "enter") {
    return state.active === event.id ? state : { active: event.id };
  }
  return state.active === event.id ? { active: null } : state;
}
