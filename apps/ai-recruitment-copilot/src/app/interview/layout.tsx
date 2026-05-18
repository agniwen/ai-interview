import type { ReactNode } from "react";
import { InterviewCopyGuard } from "./_components/interview-copy-guard";

export default function InterviewLayout({ children }: { children: ReactNode }) {
  return <InterviewCopyGuard>{children}</InterviewCopyGuard>;
}
