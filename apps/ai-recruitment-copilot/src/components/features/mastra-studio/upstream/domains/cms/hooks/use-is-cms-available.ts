import { useMastraPackages } from "@/components/features/mastra-studio/upstream/domains/configuration/hooks/use-mastra-packages";

export const useIsCmsAvailable = () => {
  const { data, isLoading: isLoadingPackages } = useMastraPackages();

  const isCmsAvailable = Boolean(data?.cmsEnabled);

  return { isCmsAvailable, isLoading: isLoadingPackages };
};
