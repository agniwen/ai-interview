import { createFileRoute } from "@tanstack/react-router";
import { MyProfilePage } from "@/components/studio/me/my-profile-page";

export const Route = createFileRoute("/w/$slug/studio/me")({
  component: MyProfilePage,
  head: () => ({
    meta: [{ title: "我的信息" }],
  }),
});
