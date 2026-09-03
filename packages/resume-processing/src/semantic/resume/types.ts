import type { ResumeSemanticSourceType } from "@app/db-schema/schema";
import type { PipelineStage } from "@app/db-schema/studio-interviews";
import type { ResumeLibraryProfileSnapshot } from "@app/shared/studio-resumes";

export interface DedupMatchRecord {
  id: string;
  sourceType?: ResumeSemanticSourceType;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionName: string | null;
  uploaderImage?: string | null;
  uploaderName?: string | null;
  resumeProfileSnapshot?: ResumeLibraryProfileSnapshot | null;
  resumeFileName?: string | null;
  skills?: string[];
  status: "active" | "archived";
  pipelineStatus?: {
    label: string;
    stage: PipelineStage;
    tone: "success" | "warning" | "info" | "outline";
  } | null;
  createdAt: string;
  conflictingSignals?: string[];
  level?: "high" | "low" | "medium";
  score?: number;
  semanticReasons?: string[];
  similarity?: {
    resumeOverview?: number;
    skillRole?: number;
    workProject?: number;
  };
}
