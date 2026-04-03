import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

async function AuthGuard({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/');
  }

  return children;
}

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <Suspense>
      <AuthGuard>{children}</AuthGuard>
    </Suspense>
  );
}
