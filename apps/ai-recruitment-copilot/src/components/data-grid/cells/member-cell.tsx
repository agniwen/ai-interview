import { cn } from "@arc/shared/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const WHITESPACE_REGEX = /\s+/u;

export interface MemberCellProps {
  avatarClassName?: string;
  avatarFallbackClassName?: string;
  avatarSize?: "default" | "sm" | "lg";
  className?: string;
  email?: string | null;
  emailClassName?: string;
  image?: string | null;
  name?: string | null;
  nameClassName?: string;
  placeholder?: string;
}

export function getMemberInitials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? "").trim();
  if (!source) {
    return "U";
  }
  const words = source.split(WHITESPACE_REGEX).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function MemberCell({
  avatarClassName,
  avatarFallbackClassName,
  avatarSize = "sm",
  className,
  email,
  emailClassName,
  image,
  name,
  nameClassName,
  placeholder = "未命名",
}: MemberCellProps) {
  const displayEmail = email?.trim() ?? "";
  const displayName = name?.trim() || displayEmail || placeholder;

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Avatar
        className={avatarClassName}
        label={`${displayName}的头像`}
        seed={`member:${displayEmail || displayName}`}
        size={avatarSize}
      >
        {image ? <AvatarImage alt={displayName} src={image} /> : null}
        <AvatarFallback className={avatarFallbackClassName}>
          {getMemberInitials(name, email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium text-sm", nameClassName)}>{displayName}</p>
        {displayEmail ? (
          <p className={cn("truncate text-muted-foreground text-xs", emailClassName)}>
            {displayEmail}
          </p>
        ) : null}
      </div>
    </div>
  );
}
