import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function InvalidJoinLink() {
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-4 text-2xl font-semibold">邀请链接已失效</h1>
      <p className="mb-6 text-muted-foreground">
        该邀请链接不存在或已被工作区管理员禁用。请联系邀请人确认。
      </p>
      <Button asChild>
        <Link to="/">返回首页</Link>
      </Button>
    </div>
  );
}
