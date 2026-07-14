import { Badge } from "@mastra/playground-ui/components/Badge";
import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { usePromptBlockVersions } from "../hooks/use-prompt-block-versions";

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export interface PromptBlockVersionComboboxProps {
  blockId: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  variant?: ComboboxProps["variant"];
  activeVersionId?: string;
}

function getVersionBadge(isPublished: boolean, isDraft: boolean) {
  if (isPublished) {
    return <Badge variant="success">Published</Badge>;
  }

  if (isDraft) {
    return <Badge variant="info">Draft</Badge>;
  }
}

export function PromptBlockVersionCombobox({
  blockId,
  value,
  onValueChange,
  className,
  disabled = false,
  variant,
  activeVersionId,
}: PromptBlockVersionComboboxProps) {
  const { data, isLoading } = usePromptBlockVersions({
    blockId,
    params: { orderBy: { direction: "DESC" } },
  });

  const versions = data?.versions ?? [];

  const activeVersion = activeVersionId
    ? versions.find((v) => v.id === activeVersionId)
    : undefined;
  const activeVersionNumber = activeVersion?.versionNumber;

  const options = [
    { label: "Latest", value: "" },
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
      placeholder={isLoading ? "Loading versions..." : "Versions"}
      searchPlaceholder="Search versions..."
      emptyText="No versions found."
      className={className}
      disabled={disabled || isLoading}
      variant={variant}
    />
  );
}
