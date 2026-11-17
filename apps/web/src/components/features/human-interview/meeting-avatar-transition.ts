import { flushSync } from "react-dom";

function readVisibleAvatars(stage: HTMLElement | null) {
  const avatars = new Map<string, HTMLElement>();
  for (const avatar of stage?.querySelectorAll<HTMLElement>("[data-meeting-avatar-participant]") ??
    []) {
    const identity = avatar.dataset.meetingAvatarParticipant;
    if (identity && avatar.getClientRects().length && !avatar.closest("[inert]")) {
      avatars.set(identity, avatar);
    }
  }
  return avatars;
}

export async function runMeetingAvatarTransition(
  stage: HTMLElement | null,
  update: () => void,
  reduceMotion: boolean,
) {
  const root = document.documentElement;
  if (Object.hasOwn(root.dataset, "meetingAvatarTransition")) {
    return;
  }

  const sources = readVisibleAvatars(stage);
  if (reduceMotion || !document.startViewTransition || !sources.size) {
    update();
    return;
  }

  const names = new Map<string, string>();
  const marked = new Set<HTMLElement>();
  for (const [identity, avatar] of sources) {
    const name = `meeting-participant-avatar-${names.size}`;
    names.set(identity, name);
    avatar.style.viewTransitionName = name;
    marked.add(avatar);
  }
  root.dataset.meetingAvatarTransition = "";

  const transition = document.startViewTransition(() => {
    for (const avatar of marked) {
      avatar.style.removeProperty("view-transition-name");
    }
    flushSync(update);
    for (const [identity, avatar] of readVisibleAvatars(stage)) {
      const name = names.get(identity);
      if (name) {
        avatar.style.viewTransitionName = name;
        marked.add(avatar);
      }
    }
  });
  await Promise.allSettled([transition.ready, transition.finished]);
  for (const avatar of marked) {
    avatar.style.removeProperty("view-transition-name");
  }
  delete root.dataset.meetingAvatarTransition;
}
