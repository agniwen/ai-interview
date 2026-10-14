import type { DemoPlaybackStep } from "./demo-playback";
import { getDemoScreenCopy } from "./demo-screen-copy";
import { DEMO_CANDIDATE_ID } from "./demo-workflow-data";

/** One identity throughout the recruiting workflow; every target belongs to a rendered scene. */
export function getDemoTourSteps(): DemoPlaybackStep[] {
  const { tour } = getDemoScreenCopy();
  return [
    { caption: tour.candidate, hold: 2200, target: `[data-demo-candidate="${DEMO_CANDIDATE_ID}"]` },
    {
      caption: tour.evaluation,
      hold: 5600,
      reveal: '[data-demo-reveal="evaluation"]',
      target: '[data-demo-detail-tab="evaluation"]',
    },
    {
      caption: tour.launch,
      hold: 3800,
      reveal: '[data-demo-reveal="dialog"]',
      target: "[data-demo-launch]",
    },
    { caption: tour.enterInterview, hold: 3300, target: "[data-demo-enter-interview]" },
    { caption: tour.turnOne, hold: 3300, target: "[data-demo-next-turn]" },
    { caption: tour.turnTwo, hold: 3300, target: "[data-demo-next-turn]" },
    { caption: tour.finishAi, hold: 2800, target: "[data-demo-finish-ai]" },
    { caption: tour.aiResult, hold: 3600, target: '[data-demo-detail-tab="interviews"]' },
    {
      caption: tour.aiTranscript,
      hold: 4200,
      reveal: '[data-demo-reveal="ai-transcript"]',
      target: "[data-demo-ai-transcript]",
    },
    { caption: tour.transitionHuman, hold: 3000, target: "[data-demo-transition-human]" },
    { caption: tour.scheduleConfirmed, hold: 2400, target: "[data-demo-dialog-close]" },
    { caption: tour.humanSchedule, hold: 3300, target: '[data-demo-detail-tab="human"]' },
    { caption: tour.enterRoom, hold: 3000, target: "[data-demo-enter-human-room]" },
    { caption: tour.roomMaterials, hold: 3400, target: "[data-demo-room-materials]" },
    {
      caption: tour.resumeFullscreen,
      hold: 3600,
      reveal: '[data-demo-reveal="dialog"]',
      target: "[data-demo-resume-fullscreen]",
    },
    { caption: tour.backToMaterials, hold: 1800, target: "[data-demo-dialog-close]" },
    {
      caption: tour.resumeEvaluation,
      hold: 3300,
      target: "[data-demo-timeline] li:first-child button",
    },
    {
      caption: tour.initialInfo,
      hold: 3300,
      target: "[data-demo-timeline] li:nth-child(2) button",
    },
    { caption: tour.roomQuestions, hold: 3400, target: "[data-demo-room-questions]" },
    { caption: tour.roomReview, hold: 3300, target: "[data-demo-room-review]" },
    { caption: tour.backToMeeting, hold: 2200, target: "[data-demo-room-materials]" },
    { caption: tour.finishHuman, hold: 2800, target: "[data-demo-finish-human]" },
    { caption: tour.humanResult, hold: 3300, target: '[data-demo-detail-tab="human"]' },
    {
      caption: tour.humanAnalysis,
      hold: 4400,
      reveal: "[data-demo-human-analysis]",
      target: "[data-demo-human-analysis] button[aria-expanded]",
    },
    {
      caption: tour.transitionOffer,
      hold: 4800,
      reveal: '[data-demo-reveal="offer"]',
      target: "[data-demo-transition-offer]",
    },
    { caption: tour.detailBack, hold: 2200, target: "[data-demo-detail-back]" },
  ];
}
