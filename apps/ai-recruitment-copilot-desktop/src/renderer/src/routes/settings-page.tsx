import { IconArrowLeft } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function SettingsPage(): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6 p-6 pb-16">
      <div className="flex items-center gap-3">
        <Button
          nativeButton={false}
          render={<Link aria-label="返回" to="/" />}
          size="icon-sm"
          variant="ghost"
        >
          <IconArrowLeft className="size-4" />
        </Button>
        <div className="space-y-0.5">
          <h1 className="text-xl font-medium tracking-tight text-foreground">设置</h1>
          <p className="text-sm text-muted-foreground">桌面端偏好（后续对接后端）。</p>
        </div>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="api-base">API 基址</FieldLabel>
          <Input
            defaultValue="http://localhost:3000"
            id="api-base"
            placeholder="https://example.com"
          />
          <FieldDescription>开发期指向本地 web/backend；生产环境可改为部署地址。</FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <Switch defaultChecked id="launch-at-login" />
          <FieldLabel htmlFor="launch-at-login">开机启动</FieldLabel>
        </Field>

        <Field orientation="horizontal">
          <Switch defaultChecked id="notify-on-finish" />
          <FieldLabel htmlFor="notify-on-finish">录制结束系统通知</FieldLabel>
        </Field>
      </FieldGroup>

      <div className="flex gap-2">
        <Button type="button">保存设置</Button>
        <Button nativeButton={false} render={<Link to="/" />} type="button" variant="outline">
          返回主页
        </Button>
      </div>
    </div>
  );
}
