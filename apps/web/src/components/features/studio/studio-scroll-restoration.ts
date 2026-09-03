export const STUDIO_MAIN_SCROLL_RESTORATION_ID = "studio-main-scroll";

const STUDIO_CANDIDATE_DETAIL_PATH = /^\/w\/[^/]+\/studio\/(?:resumes|resume-pool)\/[^/]+\/?$/;
const STUDIO_HUMAN_MEETING_DETAIL_PATH =
  /^\/w\/[^/]+\/studio\/resumes\/[^/]+\/human-interviews\/[^/]+\/meetings\/[^/]+\/?$/;

export function getStudioCandidateDetailScrollToTopElement(): HTMLElement | undefined {
  const currentLocation = globalThis.location;
  if (
    !currentLocation ||
    !(
      STUDIO_CANDIDATE_DETAIL_PATH.test(currentLocation.pathname) ||
      STUDIO_HUMAN_MEETING_DETAIL_PATH.test(currentLocation.pathname)
    )
  ) {
    return;
  }

  return (
    document.querySelector<HTMLElement>(
      `[data-scroll-restoration-id="${STUDIO_MAIN_SCROLL_RESTORATION_ID}"]`,
    ) ?? undefined
  );
}
