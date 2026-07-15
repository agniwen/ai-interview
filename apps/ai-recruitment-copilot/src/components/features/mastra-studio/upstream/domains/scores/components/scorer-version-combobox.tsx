import { Badge } from "@mastra/playground-ui/components/Badge";
import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { format } from "date-fns";
import { useScorerVersions } from "../hooks/use-scorer-versions";

function formatTimestamp(isoString: string): string {
  return format(new Date(isoString), "yyyy/MM/dd HH:mm");
}

export interface ScorerVersionComboboxProps {
  scorerId: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  variant?: ComboboxProps["variant"];
  activeVersionId?: string;
}

function getVersionBadge(isPublished: boolean, isDraft: boolean) {
  let badge;
  if (isPublished) {
    badge = <Badge variant="success">已发布</Badge>;
  } else if (isDraft) {
    badge = <Badge variant="info">草稿</Badge>;
  }
  return badge;
}

export function ScorerVersionCombobox({
  scorerId,
  value,
  onValueChange,
  className,
  disabled = false,
  variant,
  activeVersionId,
}: ScorerVersionComboboxProps) {
  const { data, isLoading } = useScorerVersions({
    params: { orderBy: { direction: "DESC" } },
    scorerId,
  });

  const versions = data?.versions ?? [];

  const activeVersion = activeVersionId
    ? versions.find((v) => v.id === activeVersionId)
    : undefined;
  const activeVersionNumber = activeVersion?.versionNumber;

  const options = [
    { label: "最新", value: "" },
    ...versions.map((version) => {
      const isPublished = version.id === activeVersionId;
      const isDraft =
        activeVersionNumber !== undefined && version.versionNumber > activeVersionNumber;

      return {
        description: formatTimestamp(version.createdAt),
        end: getVersionBadge(isPublished, isDraft),
        label: `v${version.versionNumber}`,
        value: version.id,
      };
    }),
  ];

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder={isLoading ? "正在加载版本..." : "版本"}
      searchPlaceholder="搜索版本..."
      emptyText="未找到版本。"
      className={className}
      disabled={disabled || isLoading}
      variant={variant}
    />
  );
}
