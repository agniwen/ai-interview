import { useBuilderSettings } from "@/domains/agent-builder/hooks/use-builder-settings";

export const useBuilderAgentFeatures = () => {
  const { data } = useBuilderSettings();
  const features = data?.features?.agent;

  return {
    agents: features?.agents === true,
    avatarUpload: features?.avatarUpload === true,
    browser: features?.browser === true,
    favorites: features?.favorites === true,
    memory: features?.memory === true,
    model: features?.model === true,
    skills: features?.skills === true,
    tools: features?.tools === true,
    workflows: features?.workflows === true,
  };
};
