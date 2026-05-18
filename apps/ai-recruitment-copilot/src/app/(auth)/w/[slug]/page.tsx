import { redirect } from "next/navigation";

export default async function WorkspaceRoot({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/w/${slug}/studio/resumes`);
}
