import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { PlatformLayout } from "@/components/features/platform/platform-layout";
import { getPlatformAdminState } from "@/lib/start/platform-admin";

function PlatformRoute() {
  return (
    <PlatformLayout>
      <Outlet />
    </PlatformLayout>
  );
}

export const Route = createFileRoute("/platform")({
  component: PlatformRoute,
  head: () => ({
    meta: [{ title: "平台管理" }],
  }),
  loader: async (loaderContext) => {
    const { location } = loaderContext as { location: { pathname: string } };
    const state = await getPlatformAdminState();
    if (state.status === "unauthenticated") {
      throw redirect({ href: "/login" });
    }
    if (state.status === "forbidden") {
      throw redirect({ href: "/" });
    }
    if (location.pathname === "/platform") {
      throw redirect({ href: "/platform/organizations" });
    }
    return null;
  },
});
