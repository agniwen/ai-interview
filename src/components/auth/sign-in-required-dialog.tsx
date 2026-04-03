'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthSignInForm } from './auth-sign-in-form';
import { AuthSignUpForm } from './auth-sign-up-form';
import { GoogleSignInButton } from './google-sign-in-button';

interface SignInRequiredDialogProps {
  callbackURL: string
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  closable?: boolean
}

export function SignInRequiredDialog({
  callbackURL,
  open,
  onOpenChange,
  title = '先登录后继续',
  closable = true,
}: SignInRequiredDialogProps) {
  const [activeTab, setActiveTab] = useState('sign-in');

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='max-w-md rounded-3xl border-border/70 bg-card/95 p-7 shadow-[0_30px_90px_-42px_rgba(30,72,132,0.55)] backdrop-blur-xl' showCloseButton={closable}>
        <DialogHeader className='space-y-3 text-left'>
          <DialogTitle className='pixel-title text-xl text-foreground'>
            {title}
          </DialogTitle>
          <DialogDescription className='font-serif text-sm leading-relaxed text-muted-foreground'>
            为了保存你的会话、同步简历分析记录和面试结果，请先登录或注册账号。
          </DialogDescription>
        </DialogHeader>

        <Tabs onValueChange={setActiveTab} value={activeTab}>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='sign-in'>登录</TabsTrigger>
            <TabsTrigger value='sign-up'>注册</TabsTrigger>
          </TabsList>

          <TabsContent className='mt-4' value='sign-in'>
            <div className='space-y-4'>
              <AuthSignInForm callbackURL={callbackURL} />

              <div className='relative'>
                <div className='absolute inset-0 flex items-center'>
                  <span className='w-full border-t border-border/60' />
                </div>
                <div className='relative flex justify-center text-xs'>
                  <span className='bg-card/95 px-2 text-muted-foreground'>或</span>
                </div>
              </div>

              <GoogleSignInButton callbackURL={callbackURL} />
            </div>
          </TabsContent>

          <TabsContent className='mt-4' value='sign-up'>
            <div className='space-y-4'>
              <AuthSignUpForm callbackURL={callbackURL} />

              <div className='relative'>
                <div className='absolute inset-0 flex items-center'>
                  <span className='w-full border-t border-border/60' />
                </div>
                <div className='relative flex justify-center text-xs'>
                  <span className='bg-card/95 px-2 text-muted-foreground'>或</span>
                </div>
              </div>

              <GoogleSignInButton callbackURL={callbackURL} label='使用 Google 注册' />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
