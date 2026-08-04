import { createFileRoute, useSearch } from "@tanstack/react-router";
import { HomeAuthRedirect } from "@/components/features/home/home-auth-redirect";
import { readHomeGoto } from "@/components/features/home/home-navigation";
import type { HomeGotoTarget } from "@/components/features/home/home-navigation";
import HomeShell from "@/components/features/home/home-shell";

interface HomeSearch {
  goto?: HomeGotoTarget;
}

function HomeRoute() {
  const { goto } = useSearch({ from: "/" });

  return (
    <>
      <HomeAuthRedirect goto={goto} />
      <HomeShell />
    </>
  );
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    goto: readHomeGoto(search.goto),
  }),
  component: HomeRoute,
});
