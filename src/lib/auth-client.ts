import type { auth } from './auth';
import { adminClient, genericOAuthClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined'
    ? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
    : window.location.origin,
  plugins: [adminClient(), genericOAuthClient(), inferAdditionalFields<typeof auth>()],
});
