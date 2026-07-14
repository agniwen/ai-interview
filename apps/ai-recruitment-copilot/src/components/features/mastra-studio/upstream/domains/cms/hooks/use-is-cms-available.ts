import { useMastraPackages } from "@/components/features/mastra-studio/upstream/domains/configuration";

export const useIsCmsAvailable = () => {
  const { data, isLoading: isLoadingPackages } = useMastraPackages();

  const isCmsAvailable = Boolean(data?.cmsEnabled);

  return { isCmsAvailable, isLoading: isLoadingPackages };
};
