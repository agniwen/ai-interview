import type { Metadata } from 'next';
import { LockKeyholeIcon, ShieldCheckIcon } from 'lucide-react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/lib/auth';
import { isAdminRole } from '@/lib/auth-roles';
import { StudioSwitchAccountButton } from '../_components/studio-switch-account-button';

export const metadata: Metadata = {
  title: 'Studio 登录',
};

export default async function StudioLoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user && isAdminRole(session.user.role)) {
    redirect('/studio');
  }

  return (
    <main className='relative flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(248,250,252,1),rgba(241,245,249,0.96))] px-6 py-10' id='main-content'>
      <div className='grid w-full max-w-5xl gap-6 lg:grid-cols-[1.15fr_minmax(0,420px)]'>
        <section className='rounded-[2rem] border border-border/60 bg-background/78 p-8 shadow-[0_32px_80px_-52px_rgba(15,23,42,0.38)] backdrop-blur xl:p-10'>
          <Badge className='rounded-full px-3 py-1 text-xs' variant='secondary'>
            Studio / Admin Only
          </Badge>
          <div className='mt-6 max-w-2xl space-y-5'>
            <div className='space-y-3'>
              <h1 className='text-balance font-semibold text-3xl tracking-tight sm:text-4xl'>
                进入 Studio 管理后台
              </h1>
              <p className='max-w-xl text-base text-muted-foreground leading-relaxed'>
                这里用于管理后台入口、角色权限和运营面板。只有拥有 `admin` 角色的账号才能访问 `studio/(auth)` 下的页面。
              </p>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <Card className='border-border/60 bg-card/75'>
                <CardHeader className='space-y-2'>
                  <ShieldCheckIcon className='size-5 text-primary' />
                  <CardTitle className='text-base'>角色守卫</CardTitle>
                  <CardDescription>登录后会在 layout 中校验角色，非 admin 直接回到首页。</CardDescription>
                </CardHeader>
              </Card>
              <Card className='border-border/60 bg-card/75'>
                <CardHeader className='space-y-2'>
                  <LockKeyholeIcon className='size-5 text-primary' />
                  <CardTitle className='text-base'>独立后台</CardTitle>
                  <CardDescription>Studio 使用独立 sidebar 布局，适合承载更多运营与管理页面。</CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>

        <Card className='border-border/60 bg-background/92 shadow-[0_24px_64px_-40px_rgba(15,23,42,0.35)]'>
          <CardHeader>
            <CardTitle>管理员登录</CardTitle>
            <CardDescription>
              使用 Google 账号登录。登录成功后，只有拥有 `admin` 角色的用户会进入 Studio 首页。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <GoogleSignInButton callbackURL='/studio/login' label='使用 Google 进入 Studio' />

            {session?.user
              ? (
                  <div className='space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950'>
                    <p className='font-medium text-sm'>当前已登录，但该账号不是管理员</p>
                    <p className='text-sm leading-relaxed'>
                      当前账号为
                      {' '}
                      {session.user.email}
                      。如果需要进入 Studio，请切换到拥有 `admin` 角色的账号。
                    </p>
                    <StudioSwitchAccountButton />
                  </div>
                )
              : null}

            <p className='text-muted-foreground text-xs leading-relaxed'>
              没有权限的用户即使已登录，也无法访问后台页面。你也可以先回到
              {' '}
              <Link className='font-medium text-primary hover:underline' href='/'>
                首页
              </Link>
              。
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
