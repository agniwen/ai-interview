import { MainSidebarProvider } from "@mastra/playground-ui/components/MainSidebar";
import { Outlet } from "@/components/features/mastra-studio/router/compat";

export const AgentBuilderLayout = () => (
  <div className="h-full min-h-0 w-full bg-surface1 font-sans">
    <MainSidebarProvider>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto bg-transparent">
          <Outlet />
        </div>
      </div>
    </MainSidebarProvider>
  </div>
);

export const AgentBuilderEditionLayout = () => (
  <div className="grid h-full min-h-0 w-full grid-cols-[minmax(0,1fr)] grid-rows-1 bg-surface1 font-sans">
    <Outlet />
  </div>
);
