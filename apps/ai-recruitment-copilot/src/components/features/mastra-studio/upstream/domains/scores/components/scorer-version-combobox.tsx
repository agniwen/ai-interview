import { Badge } from "@mastra/playground-ui/components/Badge";
import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { useScorerVersions } from "../hooks/use-scorer-versions";

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
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
    badge = <Badge variant="success">Published</Badge>;
  } else if (isDraft) {
    badge = <Badge variant="info">Draft</Badge>;
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
