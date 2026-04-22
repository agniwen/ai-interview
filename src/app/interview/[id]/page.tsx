import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function InterviewByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Resolve the current active round and redirect
  let roundId: string | null = null;

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/interview/${id}/resolve`,
      {
        cache: "no-store",
      },
    );

    if (response.ok) {
      const data = (await response.json()) as { roundId?: string };
      roundId = data.roundId ?? null;
    }
  } catch {
    // fall through
  }

  if (roundId) {
    redirect(`/interview/${id}/${roundId}`);
  }

  // If no round found, show a simple error
  return (
    <>
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground">当前面试链接不可用。</p>
      </div>
    </>
  );
}
