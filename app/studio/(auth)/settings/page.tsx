import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: '后台设置',
};

export default function StudioSettingsPage() {
  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      <Card className='border-border/60 bg-background/92'>
        <CardHeader>
          <CardTitle>鉴权策略</CardTitle>
          <CardDescription>当前后台访问规则由 `app/studio/(auth)/layout.tsx` 统一控制。</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3 text-sm leading-relaxed'>
          <p>1. 未登录用户访问后台路由时，直接跳转到 `/`。</p>
          <p>2. 已登录但角色不含 `admin` 的用户，也会被重定向到 `/`。</p>
          <p>3. `/studio/login` 单独保留为公开入口，管理员登录后再进入后台首页。</p>
        </CardContent>
      </Card>

      <Card className='border-border/60 bg-background/92'>
        <CardHeader>
          <CardTitle>后续建议</CardTitle>
          <CardDescription>这些通常会是接下来继续完善后台时的第一批工作。</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3 text-sm leading-relaxed'>
          <p>- 接入 Better Auth 的 `listUsers`、`setRole` 等 admin API。</p>
          <p>- 增加数据库迁移，确保 `role`、`banned` 等字段已经落库。</p>
          <p>- 为后台菜单继续补充实际业务页面，比如运营配置或审计日志。</p>
        </CardContent>
      </Card>
    </div>
  );
}
