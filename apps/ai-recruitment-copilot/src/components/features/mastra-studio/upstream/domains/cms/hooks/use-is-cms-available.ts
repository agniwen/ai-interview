import { useMastraPackages } from "@/components/features/mastra-studio/upstream/domains/configuration/hooks/use-mastra-packages";

export const useIsCmsAvailable = (options?: { enabled?: boolean }) => {
  const { data, isLoading: isLoadingPackages } = useMastraPackages(options);

  const isCmsAvailable = Boolean(data?.cmsEnabled);

  return { isCmsAvailable, isLoading: isLoadingPackages };
};
