import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { LoginPage } from "@/components/features/login/login-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { resolveLoginCallbackURL } from "@/components/features/login/login-navigation";

const loginSearchSchema = z.object({
  callbackURL: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  goto: z.enum(["agent", "studio"]).optional(),
  returnTo: z.string().optional(),
});

function LoginRoute() {
  const search = useSearch({ from: "/login" });
  const callbackURL = resolveLoginCallbackURL(search);

  return (
    <LoginPage
      callbackURL={callbackURL}
      error={search.error}
      errorDescription={search.error_description}
    />
  );
}

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  head: () => ({
    meta: [{ title: formatDocumentTitle("登录") }],
  }),
  component: LoginRoute,
});
