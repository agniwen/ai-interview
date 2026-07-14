import type { MastraClient } from "@mastra/client-js";
import { useMastraClient } from "@mastra/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface CredentialsLoginRequest {
  email: string;
  password: string;
}

export interface CredentialsLoginResponse {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  error?: string;
}

/**
 * Hook to login with email/password credentials.
 *
 * Uses Better Auth's email sign-in endpoint.
 *
 * @example
 * ```tsx
 * import { useCredentialsLogin } from '@/components/features/mastra-studio/upstream/domains/auth/hooks/use-credentials-login';
 *
 * function LoginForm() {
 *   const { mutate: login, isPending, error } = useCredentialsLogin();
 *
 *   const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
 *     e.preventDefault();
 *     const formData = new FormData(e.currentTarget);
 *     login({
 *       email: formData.get('email') as string,
 *       password: formData.get('password') as string,
 *     }, {
 *       onSuccess: () => {
 *         window.location.href = '/';
 *       },
 *     });
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input name="email" type="email" required />
 *       <input name="password" type="password" required />
 *       <button type="submit" disabled={isPending}>
 *         Sign in
 *       </button>
 *       {error && <p>{error.message}</p>}
 *     </form>
 *   );
 * }
 * ```
 */
/**
 * Makes a credentials sign-in request.
 * Exported for testing purposes.
 *
 * @internal
 */
export async function makeCredentialsLoginRequest(
  client: MastraClient,
  { email, password }: CredentialsLoginRequest,
): Promise<CredentialsLoginResponse> {
  const { baseUrl = "", apiPrefix, headers: clientHeaders = {} } = client.options || {};
  const raw = (apiPrefix ?? "/api").trim();
  let normalized = raw;
  if (raw !== "" && !raw.startsWith("/")) {
    normalized = `/${raw}`;
  }
  const prefix = normalized.replace(/\/+$/, "");

  // Generic Mastra auth endpoint - works with any credentials provider
  const response = await fetch(`${baseUrl}${prefix}/auth/credentials/sign-in`, {
    body: JSON.stringify({ email, password }),
    credentials: "include",
    headers: {
      ...clientHeaders,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || "Invalid email or password");
  }

  return data;
}

export function useCredentialsLogin() {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation<CredentialsLoginResponse, Error, CredentialsLoginRequest>({
    mutationFn: ({ email, password }) => makeCredentialsLoginRequest(client, { email, password }),
    onSuccess: () => {
      // Invalidate auth queries to refetch user state
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}
