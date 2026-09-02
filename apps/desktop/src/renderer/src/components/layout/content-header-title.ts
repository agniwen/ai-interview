import { meetingDisplayTitle } from "@app/shared/utils/time";

export function parseMeetingSessionId(pathname: string): string | null {
  const match = /^\/meetings\/([^/]+)(?:\/more)?$/.exec(pathname);
  if (!match || match[1] === "new") {
    return null;
  }
  return match[1] ?? null;
}

export function contentHeaderTitle(input: {
  pathname: string;
  sessionArchived?: boolean;
  sessionTitle?: string | null;
}): string {
  const { pathname, sessionArchived, sessionTitle } = input;
  if (pathname === "/meetings/new") {
    return "创建录制";
  }
  if (parseMeetingSessionId(pathname)) {
    if (sessionArchived) {
      return "归档记录";
    }
    const title = sessionTitle?.trim();
    return title ? meetingDisplayTitle(title) : "录制记录";
  }
  if (pathname === "/meetings") {
    return "录制记录";
  }
  if (
    pathname === "/recruitment" ||
    pathname.startsWith("/recruitment/overlay/") ||
    pathname.startsWith("/resumes/")
  ) {
    return "AI Hiring Copilot 招聘台";
  }
  if (pathname === "/settings/general") {
    return "通用";
  }
  if (pathname === "/settings/appearance") {
    return "外观";
  }
  if (pathname.startsWith("/settings")) {
    return "设置";
  }
  return "Meeting Buddy";
}
