import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function HomePage(): React.JSX.Element {
  const [remember, setRemember] = useState(true);
  const [notify, setNotify] = useState(false);

  return (
    <div className="flex justify-center p-6">
      <div className="w-full max-w-md space-y-6 pb-16">
        <div className="space-y-1">
          <h1 className="text-xl font-medium tracking-tight text-foreground">对话记录</h1>
          <p className="text-sm text-muted-foreground">
            主页预览。右上角齿轮进入设置。根布局使用 OverlayScrollbars。
          </p>
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="candidate-name">候选人姓名</FieldLabel>
            <Input id="candidate-name" placeholder="请输入姓名" />
          </Field>

          <Field>
            <FieldLabel htmlFor="role">意向岗位</FieldLabel>
            <Select defaultValue="frontend">
              <SelectTrigger className="w-full" id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="frontend">前端工程师</SelectItem>
                <SelectItem value="backend">后端工程师</SelectItem>
                <SelectItem value="product">产品经理</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="notes">面试备注</FieldLabel>
            <Textarea id="notes" placeholder="记录关键信息…" />
            <FieldDescription>仅本地预览，尚未接入后端。</FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              checked={remember}
              id="remember"
              onCheckedChange={(value) => setRemember(value === true)}
            />
            <FieldLabel htmlFor="remember">记住本次选择</FieldLabel>
          </Field>

          <Field orientation="horizontal">
            <Switch checked={notify} id="notify" onCheckedChange={setNotify} />
            <FieldLabel htmlFor="notify">结束后通知</FieldLabel>
          </Field>
        </FieldGroup>

        <div className="flex flex-wrap gap-2">
          <Button type="button">保存</Button>
          <Button type="button" variant="outline">
            取消
          </Button>
          <Button type="button" variant="ghost">
            重置
          </Button>
        </div>
      </div>
    </div>
  );
}
