import type { ResumeProfile } from "@/lib/shared/interview/types";

export interface ParseResult {
  fileName: string;
  resumeProfile: ResumeProfile;
}

export type ImportPhase = "idle" | "preparing" | "parsing" | "generating" | "saving";

export interface PartialField {
  label: string;
  value: string;
}

export interface ProgressTool {
  name: string;
  done: boolean;
}
