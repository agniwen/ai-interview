import { Badge } from "@mastra/playground-ui/components/Badge";
import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { useAgentVersions } from "../hooks/use-agent-versions";

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

export interface AgentVersionComboboxProps {
  agentId: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  variant?: ComboboxProps["variant"];
  activeVersionId?: string;
}

export function AgentVersionCombobox({
  agentId,
  value,
  onValueChange,
  className,
  disabled = false,
  variant,
  activeVersionId,
}: AgentVersionComboboxProps) {
  const { data, isLoading } = useAgentVersions({
    agentId,
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

      const trimmedMessage = version.changeMessage?.trim();
      const description = [
        formatTimestamp(version.createdAt),
        trimmedMessage && trimmedMessage !== "Auto-saved after edit" ? trimmedMessage : undefined,
      ]
        .filter(Boolean)
        .join(" — ");

      return {
        description,
        end: isPublished ? (
          <Badge variant="success">Published</Badge>
        ) : (isDraft ? (
          <Badge variant="info">Draft</Badge>
        ) : undefined),
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
