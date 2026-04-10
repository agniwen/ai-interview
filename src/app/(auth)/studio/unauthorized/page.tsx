'use client';

import { LoaderCircleIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { authClient } from '@/lib/auth-client';

export default function StudioUnauthorizedPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleConfirm = async () => {
    setOpen(false);
    setIsRedirecting(true);

    try {
      await authClient.signOut();
    }
    catch {
      // Ignore sign-out failures and continue redirecting.
    }
    finally {
      router.replace('/');
      router.refresh();
    }
  };

  return (
    <main className='flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center' id='main-content'>
      <AlertDialog open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>权限不足</AlertDialogTitle>
            <AlertDialogDescription>
              当前账号没有管理员权限，无法访问此页面。点击确认后将退出登录并返回首页。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleConfirm}>
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isRedirecting && (
        <>
          <LoaderCircleIcon className='size-6 animate-spin text-muted-foreground' />
          <p className='text-muted-foreground text-sm'>正在退出当前账号并返回首页...</p>
        </>
      )}
    </main>
  );
}
