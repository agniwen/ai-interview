'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { SignInRequiredDialog } from './sign-in-required-dialog';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const pathname = usePathname();

  if (isPending) {
    return null;
  }

  if (!session) {
    return <SignInRequiredDialog callbackURL={pathname} closable={false} open onOpenChange={() => {}} />;
  }

  return children;
}
