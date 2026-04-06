import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: '用户与角色',
};

const roleRows = [
  {
    role: 'admin',
    access: '可访问 `/studio` 及其受保护子路由',
    notes: '适合后台管理员与运营维护角色。',
  },
  {
    role: 'user',
    access: '不可进入 Studio 后台',
    notes: '访问 `studio/(auth)` 时会被重定向到首页。',
  },
];

export default function StudioUsersPage() {
  return (
    <div className='space-y-6'>
      <section className='rounded-[1.5rem] border border-border/60 bg-background px-6 py-6 shadow-sm'>
        <Badge className='rounded-full' variant='secondary'>角色模型</Badge>
        <h1 className='mt-4 font-semibold text-3xl tracking-tight'>用户与角色</h1>
        <p className='mt-3 max-w-2xl text-muted-foreground leading-relaxed'>
          当前后台基于 Better Auth Admin 插件区分角色。只要把用户角色设置为 `admin`，就可以进入 Studio 后台布局下的页面。
        </p>
      </section>

      <Card className='border-border/60 bg-background/92'>
        <CardHeader>
          <CardTitle>角色访问说明</CardTitle>
          <CardDescription>这是当前接入方式的基础规则说明。</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          {roleRows.map(item => (
            <div className='rounded-2xl border border-border/60 bg-muted/35 p-4' key={item.role}>
              <div className='flex items-center gap-3'>
                <Badge className='rounded-full' variant={item.role === 'admin' ? 'default' : 'secondary'}>
                  {item.role}
                </Badge>
                <span className='font-medium text-sm'>{item.access}</span>
              </div>
              <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>{item.notes}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
