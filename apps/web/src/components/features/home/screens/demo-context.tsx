"use client";

import type { ResumeProfile } from "@app/db-schema/interview/types";
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import * as m from "@/paraglide/messages";

export interface DemoDialog {
  kind: "launch" | "schedule" | "resume";
  title: string;
}
export interface DemoCandidate {
  title: string;
  id?: string;
  pipeline?: string;
  profile?: ResumeProfile;
  fields?: { label: string; value: string }[];
}

export type DemoPhase =
  | "screening"
  | "invited"
  | "live"
  | "ai-completed"
  | "human-live"
  | "human-scheduled"
  | "human-completed"
  | "offer";

function useDemoState() {
  const [phase, setPhase] = useState<DemoPhase>("screening");
  const [turn, setTurn] = useState(0);
  const [candidate, setCandidate] = useState<DemoCandidate | null>(null);
  const [dialog, setDialog] = useState<DemoDialog | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [group, setGroup] = useState("all");
  const [stage, setStage] = useState("all");
  const [personal, setPersonal] = useState(false);
  const [notice, setNotice] = useState("");
  return {
    candidate,
    dialog,
    filter,
    group,
    notice,
    page: m.home_frame_nav_recruitment(),
    personal,
    phase,
    query,
    setCandidate,
    setDialog,
    setFilter,
    setGroup,
    setNotice,
    setPersonal,
    setPhase,
    setQuery,
    setStage,
    setTurn,
    stage,
    turn,
  };
}

type DemoState = ReturnType<typeof useDemoState>;
const DemoContext = createContext<DemoState | null>(null);
const DemoResetContext = createContext<(() => void) | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const state = useDemoState();
  const {
    setPhase,
    setTurn,
    setCandidate,
    setDialog,
    setGroup,
    setStage,
    setQuery,
    setFilter,
    setPersonal,
    setNotice,
  } = state;
  const reset = useCallback(() => {
    setPhase("screening");
    setTurn(0);
    setCandidate(null);
    setDialog(null);
    setGroup("all");
    setStage("all");
    setQuery("");
    setFilter("");
    setPersonal(false);
    setNotice("");
  }, [
    setPhase,
    setTurn,
    setCandidate,
    setDialog,
    setGroup,
    setStage,
    setQuery,
    setFilter,
    setPersonal,
    setNotice,
  ]);
  return (
    <DemoResetContext.Provider value={reset}>
      <DemoContext.Provider value={state}>{children}</DemoContext.Provider>
    </DemoResetContext.Provider>
  );
}

export function useOptionalDemo() {
  return useContext(DemoContext);
}

export function useDemo() {
  const demo = useOptionalDemo();
  if (!demo) {
    throw new Error("Interactive preview requires DemoProvider");
  }
  return demo;
}

/** Stable playback command: animation components do not subscribe to changing candidate state. */
export function useDemoReset() {
  const reset = useContext(DemoResetContext);
  if (!reset) {
    throw new Error("Demo reset requires DemoProvider");
  }
  return reset;
}
