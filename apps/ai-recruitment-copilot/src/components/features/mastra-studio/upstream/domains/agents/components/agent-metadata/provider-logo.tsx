import { Icon } from "@mastra/playground-ui/icons/Icon";
import { useState } from "react";
import { OptimizedImage } from "../../utils/optimized-image";
import { providerMapToIcon } from "../provider-map-icon";
import { cleanProviderId as cleanProviderIdUtil } from "./utils";

interface ProviderLogoProps {
  providerId: string;
  className?: string;
  size?: number;
}

const FALLBACK_PROVIDER_ICONS: Record<string, string> = {
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

function getFallbackProviderIcon(id: string): string {
  return FALLBACK_PROVIDER_ICONS[id] || "DEFAULT";
}

/**
 * Component to display provider logos from models.dev
 * Falls back to local icons if the logo fails to load
 */
export const ProviderLogo = ({ providerId, className = "", size = 20 }: ProviderLogoProps) => {
  const [imageError, setImageError] = useState(false);

  // Clean provider ID (remove .chat, .x, .messages, etc. suffixes)
  const cleanedProviderId = cleanProviderIdUtil(providerId);

  // Clean up provider ID for models.dev (remove special characters like slashes)
  const cleanProviderId = cleanedProviderId.replaceAll("/", "-").toLowerCase();

  // Get fallback icon from our existing mapping
  const fallbackIcon = getFallbackProviderIcon(cleanedProviderId);
  const isGateway = ["netlify", "mastra"].includes(cleanProviderId);

  // If we've already had an error or don't have a provider ID or this is a special gateway case, show fallback
  if (isGateway || imageError || !providerId) {
    if (providerMapToIcon[fallbackIcon as keyof typeof providerMapToIcon]) {
      return <Icon>{providerMapToIcon[fallbackIcon as keyof typeof providerMapToIcon]}</Icon>;
    }
    return (
      <div className={`bg-surface4 rounded ${className}`} style={{ height: size, width: size }} />
    );
  }

  return (
    <OptimizedImage
      src={`https://models.dev/logos/${cleanProviderId}.svg`}
      alt={`${providerId} logo`}
      width={size}
      height={size}
      className={className}
      onError={() => setImageError(true)}
      loading="lazy"
      style={{
        height: `${size}px`,
        objectFit: "contain",
        width: `${size}px`,
      }}
    />
  );
};
