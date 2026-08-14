import { Button } from "@mastra/playground-ui/components/Button";
import { cn } from "@mastra/playground-ui/utils/cn";
import { Star } from "lucide-react";
import type { MouseEvent } from "react";
import { useBuilderAgentFeatures } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-agent-features";
import { useToggleStoredAgentFavorite } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-stored-agent-favorite";
import { useAuthCapabilities } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-auth-capabilities";
import { isAuthenticated } from "@/components/features/mastra-studio/upstream/domains/auth/types";

export interface FavoriteButtonProps {
  agentId: string;
  isFavorited?: boolean;
  favoriteCount?: number;
  size?: "sm" | "md";
  className?: string;
  /** Show the count badge next to the icon. Defaults to true. */
  showCount?: boolean;
}

const iconSizes = {
  md: 16,
  sm: 14,
} as const;

/**
 * Toggles the favorite state for a stored agent. Renders nothing if the EE
 * `agent.favorites` flag is off. Stops click propagation so it can sit inside a
 * row that is itself a link.
 */
export const FavoriteButton = ({
  agentId,
  isFavorited = false,
  favoriteCount,
  size = "md",
  className,
  showCount = true,
}: FavoriteButtonProps) => {
  const features = useBuilderAgentFeatures();
  const toggle = useToggleStoredAgentFavorite(agentId);
  const { data: capabilities, isLoading } = useAuthCapabilities();

  if (isLoading) {
    return null;
  }
  if (!features.favorites) {
    return null;
  }

  const signedIn = capabilities ? isAuthenticated(capabilities) : false;
  const label = isFavorited ? "取消收藏智能体" : "收藏智能体";
  const disabledLabel = "登录后可收藏此智能体";
  const countLabel = "收藏";
  const isDisabled = toggle.isPending || !signedIn;

  return (
    <Button
      type="button"
      variant="default"
      size={size}
      aria-pressed={isFavorited}
      aria-label={signedIn ? label : disabledLabel}
      title={signedIn ? label : disabledLabel}
      disabled={isDisabled}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!signedIn) {
          return;
        }
        toggle.mutate({ favorited: !isFavorited });
      }}
      className={cn("shrink-0", signedIn ? "cursor-pointer" : "cursor-not-allowed", className)}
    >
      <Star
        size={iconSizes[size]}
        className={cn("shrink-0", isFavorited && "fill-current text-yellow-300")}
        aria-hidden
      />
      {showCount && typeof favoriteCount === "number" && (
        <span className="leading-none whitespace-nowrap">
          <span className="tabular-nums">{favoriteCount}</span> {countLabel}
        </span>
      )}
    </Button>
  );
};
