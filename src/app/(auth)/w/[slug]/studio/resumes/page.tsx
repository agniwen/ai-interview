import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ResumeLibraryPage } from "@/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { loadResumeLibraryMetrics } from "@/server/routes/studio/routes/resumes/dao/metrics";
import { listResumeRecords } from "@/server/routes/studio/routes/resumes/dao/resumes";

export const metadata: Metadata = {
  title: "简历库",
};

export default async function StudioResumesPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }
  // 列表数据与头部 chart 聚合并发拉取 —— 两边都打 `studio-resumes` cache tag，
  // 写入侧 invalidate 一次同时刷新。
  // List + header-chart aggregations are fetched in parallel; both rely on the
  // same `studio-resumes` cache tag so a single invalidation refreshes both.
  const [initialData, metrics] = await Promise.all([
    listResumeRecords(activeOrg.id),
    loadResumeLibraryMetrics(activeOrg.id),
  ]);
  return <ResumeLibraryPage initialData={initialData} metrics={metrics} />;
}
