import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { auth } from '@/lib/auth';

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode
}) {
  await connection();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  return children;
}
