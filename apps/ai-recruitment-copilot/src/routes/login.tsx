import { createFileRoute, useSearch } from "@tanstack/react-router";
import { LoginPage } from "@/components/features/login/login-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
import {
  readLoginGoto,
  resolveLoginCallbackURL,
} from "@/components/features/login/login-navigation";
import type { LoginGotoTarget } from "@/components/features/login/login-navigation";

interface LoginSearch {
  callbackURL?: string;
  error?: string;
  error_description?: string;
  goto?: LoginGotoTarget;
  returnTo?: string;
}

function readSearchValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

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
  component: LoginRoute,
  head: () => ({
    meta: [{ title: formatDocumentTitle("登录") }],
  }),
  validateSearch: (search): LoginSearch => ({
    callbackURL: readSearchValue(search.callbackURL),
    error: readSearchValue(search.error),
    error_description: readSearchValue(search.error_description),
    goto: readLoginGoto(search.goto),
    returnTo: readSearchValue(search.returnTo),
  }),
});
