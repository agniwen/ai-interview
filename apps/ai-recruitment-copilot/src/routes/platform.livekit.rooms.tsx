import { createFileRoute } from "@tanstack/react-router";
import { LiveKitRoomsGrid } from "@/components/features/platform/livekit/livekit-rooms-grid";

function PlatformLiveKitRoomsRoute() {
  return (
    <div className="container mx-auto">
      <LiveKitRoomsGrid />
    </div>
  );
}

export const Route = createFileRoute("/platform/livekit/rooms")({
  component: PlatformLiveKitRoomsRoute,
  head: () => ({ meta: [{ title: "平台 · LiveKit 实时房间" }] }),
});
