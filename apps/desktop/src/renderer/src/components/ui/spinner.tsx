import { Icon } from "@/components/ui/icon";
import { cn } from "@app/shared/utils";

function Spinner({ className, ...props }: Omit<React.ComponentProps<typeof Icon>, "icon">) {
  return (
    <Icon
      icon="ph:spinner"
      role="status"
      aria-label="加载中"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
