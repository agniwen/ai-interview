import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { AuthSignInForm } from '@/components/auth/auth-sign-in-form';
import { AuthSignUpForm } from '@/components/auth/auth-sign-up-form';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { auth } from '@/lib/auth';
import { isAdminRole } from '@/lib/auth-roles';

export const metadata: Metadata = {
  title: '登录',
};

export default async function LoginPage() {
  await connection();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return (
      <main className='relative flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(248,250,252,1),rgba(241,245,249,0.96))] px-6 py-10' id='main-content'>
        <div className='w-full max-w-md'>
          <Card className='border-border/60 bg-background/92 shadow-[0_24px_64px_-40px_rgba(15,23,42,0.35)]'>
            <CardHeader>
              <CardTitle>登录</CardTitle>
              <CardDescription>
                登录后即可使用完整功能。
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Tabs defaultValue='sign-in'>
                <TabsList className='w-full'>
                  <TabsTrigger className='flex-1' value='sign-in'>登录</TabsTrigger>
                  <TabsTrigger className='flex-1' value='sign-up'>注册</TabsTrigger>
                </TabsList>
                <TabsContent className='mt-4' value='sign-in'>
                  <AuthSignInForm callbackURL='/login' />
                </TabsContent>
                <TabsContent className='mt-4' value='sign-up'>
                  <AuthSignUpForm callbackURL='/login' />
                </TabsContent>
              </Tabs>

              <div className='relative'>
                <Separator />
                <span className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-muted-foreground text-xs'>
                  或
                </span>
              </div>

              <GoogleSignInButton callbackURL='/login' label='使用 Google 登录' />
            </CardContent>
          </Card>

          <p className='mt-4 text-center text-muted-foreground text-xs leading-relaxed'>
            <Link className='font-medium text-primary hover:underline' href='/'>
              返回首页
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (isAdminRole(session.user.role)) {
    redirect('/studio');
  }

  redirect('/studio/unauthorized');
}
