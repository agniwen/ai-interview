import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { listCandidateFormTemplates } from "@/server/routes/studio/routes/forms/dao/queries";
import { listAllJobDescriptions } from "@/server/routes/studio/routes/job-descriptions/dao";
import { CandidateFormTemplateManagementPage } from "./_components/form-template-management-page";

export const metadata: Metadata = {
  title: "面试表单",
};

export default async function StudioCandidateFormsPage({
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
  const [initialData, jobDescriptions] = await Promise.all([
    listCandidateFormTemplates(activeOrg.id),
    listAllJobDescriptions(activeOrg.id),
  ]);

  return (
    <CandidateFormTemplateManagementPage
      initialData={initialData}
      jobDescriptions={jobDescriptions}
    />
  );
}
