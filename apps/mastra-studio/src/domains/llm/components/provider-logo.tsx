import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { useState } from "react";
import type { CSSProperties } from "react";
import { cleanProviderId as cleanProviderIdUtil } from "../utils";
import { providerMapToIcon } from "@/domains/agents/components/provider-map-icon";

interface ProviderLogoProps {
  providerId: string;
  className?: string;
  size?: number;
  style?: CSSProperties;
}

/**
 * Component to display provider logos from models.dev
 * Falls back to local icons if the logo fails to load
 */
export const ProviderLogo = ({
  providerId,
  className = "",
  size = 20,
  style,
}: ProviderLogoProps) => {
  const [imageError, setImageError] = useState(false);

  // Clean provider ID (remove .chat, .x, .messages, etc. suffixes)
  const cleanedProviderId = cleanProviderIdUtil(providerId);

  // Clean up provider ID for models.dev (remove special characters like slashes)
  const cleanProviderId = cleanedProviderId.replaceAll("/", "-").toLowerCase();

  // Get fallback icon from our existing mapping
  const getFallbackProviderIcon = (id: string): string => {
    const iconMap: Record<string, string> = {
      anthropic: "anthropic.messages",
      deepseek: "deepseek",
      fireworks_ai: "fireworks",
      google: "GOOGLE",
      groq: "GROQ",
      mastra: "mastra",
      mistral: "mistral",
      netlify: "netlify",
      openai: "openai.chat",
      openrouter: "openrouter",
      perplexity: "perplexity",
      together: "together",
      xai: "X_GROK",
    };
    return iconMap[id] || "DEFAULT";
  };

  const fallbackIcon = getFallbackProviderIcon(cleanedProviderId);
  const isGateway = ["netlify", "mastra"].includes(cleanProviderId);

  // If we've already had an error or don't have a provider ID or this is a special gateway case, show fallback
  if (isGateway || imageError || !providerId) {
    if (providerMapToIcon[fallbackIcon as keyof typeof providerMapToIcon]) {
      return <Icon>{providerMapToIcon[fallbackIcon as keyof typeof providerMapToIcon]}</Icon>;
    }
    return (
      <div
        className={cn("bg-surface4 rounded shrink-0", className)}
        style={{ height: size, minHeight: size, minWidth: size, width: size, ...style }}
      />
    );
  }

  return (
    <img
      src={`https://models.dev/logos/${cleanProviderId}.svg`}
      alt={`${providerId} logo`}
      width={size}
      height={size}
      className={cn("shrink-0 dark:brightness-0 dark:invert", className)}
      onError={() => setImageError(true)}
      loading="lazy"
      style={{
        height: `${size}px`,
        minHeight: `${size}px`,
        minWidth: `${size}px`,
        objectFit: "contain",
        opacity: 0.9,
        width: `${size}px`,
      }}
    />
  );
};
