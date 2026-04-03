'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { GoogleIcon } from './google-icon';

interface GoogleSignInButtonProps {
  callbackURL: string
  className?: string
  label?: string
}

export function GoogleSignInButton({
  callbackURL,
  className,
  label = '使用 Google 登录',
}: GoogleSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Button
      className={cn('w-full gap-2 rounded-full!', className)}
      disabled={isSubmitting}
      onClick={() => {
        setIsSubmitting(true);
        authClient.signIn.social({
          provider: 'google',
          callbackURL,
        });
      }}
      type='button'
      variant='secondary'
    >
      <GoogleIcon />
      {isSubmitting ? '正在跳转...' : label}
    </Button>
  );
}
