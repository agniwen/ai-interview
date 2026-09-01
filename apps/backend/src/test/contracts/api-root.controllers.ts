import { AgentController } from "../../domains/candidate-lifecycle/ai-interviews/agent/agent.controller.js";
import { JoinController } from "../../domains/identity-access/join/join.controller.js";
import { MeetingLocalRecoveryController } from "../../domains/meetings/local-recovery/meeting-local-recovery.controller.js";
import { InterviewController } from "../../domains/candidate-lifecycle/ai-interviews/candidate-api/interview.controller.js";
import { LiveKitController } from "../../domains/candidate-lifecycle/human-interviews/livekit/livekit.controller.js";
import { PlatformController } from "../../domains/platform-operations/http/platform.controller.js";
import {
  PublicController,
  PublicHumanInterviewCandidateMaterialsController,
} from "../../domains/candidate-lifecycle/candidate-api/public/public.controller.js";
import { ResumeController } from "../../domains/candidate-lifecycle/candidate-api/resume/resume.controller.js";
import { PublicInterviewerVoicePreviewController } from "../../domains/recruiting-setup/interviewers/public-interviewer-voice-preview.controller.js";

/** Stable transport inventory used by route-contract tests; provider wiring lives in owner domain modules. */
export const API_ROOT_CONTROLLERS = [
  AgentController,
  InterviewController,
  JoinController,
  LiveKitController,
  MeetingLocalRecoveryController,
  PlatformController,
  PublicController,
  PublicHumanInterviewCandidateMaterialsController,
  PublicInterviewerVoicePreviewController,
  ResumeController,
] as const;
