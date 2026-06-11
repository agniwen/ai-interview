import type { ResumeProfile } from "@arc/db-schema/interview/types";

export interface ParseResult {
  fileName: string;
  resumeProfile: ResumeProfile;
}

// 「生成面试题」阶段已挪到「发起 AI 面试」时按需触发，一键入库只把简历放进库。
// Question generation moved into the launch-interview flow; import is save-only now.
export type ImportPhase = "idle" | "preparing" | "parsing" | "saving";

export interface PartialField {
  label: string;
  value: string;
}

export interface ProgressTool {
  name: string;
  done: boolean;
}
