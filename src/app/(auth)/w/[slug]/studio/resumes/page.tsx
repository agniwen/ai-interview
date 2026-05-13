import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ResumeLibraryPage } from "@/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page";
import { resolveActiveOrganization } from "@/lib/server/auth-session";
import { listResumeRecords } from "@/server/routes/studio/routes/resumes/dao/resumes";

export const metadata: Metadata = {
  title: "简历库",
};

export default async function StudioResumesPage() {
  await connection();
  const activeOrg = await resolveActiveOrganization();
  if (!activeOrg) {
    notFound();
  }
  const initialData = await listResumeRecords(activeOrg.id);
  return <ResumeLibraryPage initialData={initialData} />;
}
