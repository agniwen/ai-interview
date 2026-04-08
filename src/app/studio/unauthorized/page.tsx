'use client';

import { LoaderCircleIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { authClient } from '@/lib/auth-client';

export default function StudioUnauthorizedPage() {
  const router = useRouter();

  useEffect(() => {
    let isCancelled = false;

    const signOutAndRedirect = async () => {
      try {
        await authClient.signOut();
      }
      catch {
        // Ignore sign-out failures and continue redirecting.
      }
      finally {
        if (!isCancelled) {
          router.replace('/');
          router.refresh();
        }
      }
    };

    void signOutAndRedirect();

    return () => {
      isCancelled = true;
    };
  }, [router]);

  return (
    <main className='flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center' id='main-content'>
      <LoaderCircleIcon className='size-6 animate-spin text-muted-foreground' />
      <p className='text-muted-foreground text-sm'>正在退出当前账号并返回首页...</p>
    </main>
  );
}
