import type { Metadata } from 'next';
import { ActivityIcon, BotIcon, ShieldCheckIcon, UsersIcon, WorkflowIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Studio 概览',
};

const summaryCards = [
  {
    title: '后台入口',
    value: 'Studio',
    description: '使用独立 sidebar layout 承载管理页面。',
    icon: ShieldCheckIcon,
  },
  {
    title: '角色模型',
    value: 'admin / user',
    description: '基于 Better Auth Admin 插件区分访问权限。',
    icon: UsersIcon,
  },
  {
    title: '路由守卫',
    value: 'layout',
    description: '统一在布局层校验 session 与角色。',
    icon: WorkflowIcon,
  },
  {
    title: 'AI 面试管理',
    value: 'CRUD',
    description: '支持后台创建、编辑和查看候选人面试记录。',
    icon: BotIcon,
  },
];

export default function StudioDashboardPage() {
  return (
    <div className='space-y-6'>
      <section className='rounded-[1.75rem] border border-border/60 bg-background px-6 py-6 shadow-sm lg:px-8 lg:py-8'>
        <Badge className='rounded-full' variant='secondary'>后台总览</Badge>
        <div className='mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between'>
          <div className='max-w-2xl space-y-3'>
            <h1 className='text-balance font-semibold text-3xl tracking-tight'>
              Studio 已准备好承载你的 admin 工作流
            </h1>
            <p className='text-muted-foreground leading-relaxed'>
              这个入口已经完成 sidebar 布局拆分、Better Auth 角色接入，以及基于 layout 的后台访问保护。后续可以直接往这里扩展用户管理、运营配置和审计页面。
            </p>
          </div>
          <div className='flex gap-3'>
            <Button asChild>
              <Link href='/studio/interviews'>进入 AI 面试管理</Link>
            </Button>
            <Button asChild variant='outline'>
              <Link href='/studio/users'>查看角色页面</Link>
            </Button>
            <Button asChild variant='outline'>
              <Link href='/studio/settings'>查看后台设置</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className='grid gap-4 xl:grid-cols-4'>
        {summaryCards.map((item) => {
          const Icon = item.icon;

          return (
            <Card className='border-border/60 bg-background/92' key={item.title}>
              <CardHeader className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <CardDescription>{item.title}</CardDescription>
                  <Icon className='size-4 text-primary' />
                </div>
                <CardTitle className='text-2xl'>{item.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-muted-foreground text-sm leading-relaxed'>{item.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className='grid gap-4 lg:grid-cols-[1.25fr_0.9fr]'>
        <Card className='border-border/60 bg-background/92'>
          <CardHeader>
            <CardTitle>接下来适合放进来的模块</CardTitle>
            <CardDescription>当前页面是后台壳层，下面这些模块可以直接继续扩展。</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-3'>
            {[
              '用户列表、角色调整与禁用操作',
              '面试记录、聊天会话与运营数据面板',
              '后台配置项、开关和环境检查',
            ].map(item => (
              <div className='rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm' key={item}>
                {item}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className='border-border/60 bg-background/92'>
          <CardHeader>
            <CardTitle>当前状态</CardTitle>
            <CardDescription>这部分方便后续接入真实后台数据。</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {[
              ['Auth', 'Better Auth + Admin Plugin'],
              ['Guard', 'Server layout redirect'],
              ['Access', 'Only admin can enter'],
            ].map(([label, value]) => (
              <div className='flex items-center justify-between rounded-xl border border-border/60 px-4 py-3' key={label}>
                <span className='text-muted-foreground text-sm'>{label}</span>
                <span className='font-medium text-sm'>{value}</span>
              </div>
            ))}
            <div className='rounded-xl border border-dashed border-border px-4 py-4 text-muted-foreground text-sm leading-relaxed'>
              这里后面可以替换成真实统计卡、任务流或者审计日志。
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className='border-border/60 bg-background/92'>
        <CardHeader>
          <CardTitle>运营提示</CardTitle>
          <CardDescription>示例内容，用来占住 block 风格的主内容区域。</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-3'>
          {[
            '角色变更建议走后台操作并保留审计记录。',
            '新的 Studio 页面建议继续挂在 `app/studio/(auth)` 下。',
            '如果需要真正管理用户，可直接接 Better Auth 的 admin API。',
          ].map(item => (
            <div className='flex min-h-32 flex-col justify-between rounded-2xl border border-border/60 bg-muted/35 p-4' key={item}>
              <ActivityIcon className='size-4 text-primary' />
              <p className='text-sm leading-relaxed'>{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
