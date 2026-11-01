import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$slug/studio/question-bank/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      params: { slug: params.slug },
      replace: true,
      to: "/w/$slug/studio/question-bank/forms",
    });
  },
});
