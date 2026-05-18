import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { listAllDepartments } from "@/server/routes/studio/routes/departments/dao";
import { listAllInterviewers } from "@/server/routes/studio/routes/interviewers/dao";
import {
  listJobDescriptions,
  loadJobDescriptionMetrics,
} from "@/server/routes/studio/routes/job-descriptions/dao";
import { JobDescriptionManagementPage } from "./_components/job-description-management-page";

export const metadata: Metadata = {
  title: "在招岗位管理",
};

export default async function StudioJobDescriptionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }
  const [initialData, departments, interviewers, metrics] = await Promise.all([
    listJobDescriptions(activeOrg.id),
    listAllDepartments(activeOrg.id),
    listAllInterviewers(activeOrg.id),
    loadJobDescriptionMetrics(activeOrg.id),
  ]);

  return (
    <JobDescriptionManagementPage
      departments={departments}
      initialData={initialData}
      interviewers={interviewers}
      metrics={metrics}
    />
  );
}
