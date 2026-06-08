import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// 表格里「创建人」列的通用呈现：小头像（24px）+ 姓名，无姓名时退化为占位符。
// 简历库 / AI 面试等不同表都使用同一份投影字段（creatorName + creatorImage），
// 抽到这里方便后续替换风格或新增二级信息。
//
// Shared cell renderer for the 创建人 column across studio tables. Takes the
// minimal projection (name + image) that all relevant list DTOs already
// provide; keeps the avatar size tied to the table density (sm = 24px).
export function CreatorCell({
  name,
  image,
  placeholder = "—",
}: {
  name: string | null;
  image: string | null;
  placeholder?: string;
}) {
  if (!name) {
    return <span className="text-muted-foreground">{placeholder}</span>;
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar size="sm">
        {image ? <AvatarImage alt={name} src={image} /> : null}
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </div>
  );
}
