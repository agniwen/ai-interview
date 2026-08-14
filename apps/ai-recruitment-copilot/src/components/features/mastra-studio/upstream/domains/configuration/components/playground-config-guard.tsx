import { Button } from "@mastra/playground-ui/components/Button";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";

export const PlaygroundConfigGuard = () => (
  <div className="flex h-full w-full items-center justify-center bg-surface1">
    <ErrorState
      action={<Button onClick={() => window.location.reload()}>刷新</Button>}
      message="嵌入的 Studio 无法连接 ARC Mastra 服务器。"
      title="Studio 加载失败"
    />
  </div>
);
