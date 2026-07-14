import { Button } from "@mastra/playground-ui/components/Button";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";

export const PlaygroundConfigGuard = () => (
  <div className="flex h-full w-full items-center justify-center bg-surface1">
    <ErrorState
      action={<Button onClick={() => window.location.reload()}>Refresh</Button>}
      message="The embedded Studio could not connect to the ARC Mastra server."
      title="Failed to load Studio"
    />
  </div>
);
