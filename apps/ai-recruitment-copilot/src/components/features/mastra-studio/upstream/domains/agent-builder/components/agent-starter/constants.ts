import { GraduationCap, MessageCircleQuestion, MessagesSquare, Wrench } from "lucide-react";

export const FALLBACK_MODEL = { name: "gemini-2.5-flash", provider: "google" } as const;

export const EXAMPLES = [
  {
    icon: MessagesSquare,
    prompt:
      "Build an agent that triages incoming customer support emails. Classify urgency, route to the right team, and draft a polite first reply that asks for missing details.",
    title: "Support triage",
  },
  {
    icon: MessageCircleQuestion,
    prompt:
      "Build an agent that runs an async Slack standup. It pings each team member in the morning, collects what they did, what they will do, and any blockers, then posts a concise summary in #standup.",
    title: "Standup bot",
  },
  {
    icon: Wrench,
    prompt:
      "Build an agent that reviews TypeScript pull requests on GitHub. Look for type-safety issues, missing tests, and inconsistent patterns. Leave inline review comments with concrete suggestions.",
    title: "PR reviewer",
  },
  {
    icon: GraduationCap,
    prompt:
      "Build an agent that onboards new engineers to our codebase. It explains the architecture, points to the right docs, and answers questions in plain English with code examples.",
    title: "Onboarding tutor",
  },
];
