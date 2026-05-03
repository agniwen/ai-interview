import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  description: "上传候选人简历，立即开始一场 AI 语音面试。",
  title: "AI 面试 · 快速开始",
};

export default function InterviewQuickStartPage() {
  redirect("/studio/interviews");
}
