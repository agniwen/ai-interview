import type { Metadata } from "next";
import { MyProfilePage } from "./_components/my-profile-page";

export const metadata: Metadata = {
  title: "我的信息",
};

export default function StudioMePage() {
  return <MyProfilePage />;
}
