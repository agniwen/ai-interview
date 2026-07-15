import { lazy, Suspense, useEffect, useState } from "react";

import { useNavigationCommand } from "./use-navigation-command";

const LazyNavigationCommandDialog = lazy(async () => {
  const { NavigationCommand } = await import("./navigation-command");
  return { default: NavigationCommand };
});

export const NavigationCommand = () => {
  const { open } = useNavigationCommand();
  const [hasOpened, setHasOpened] = useState(open);

  useEffect(() => {
    if (open) {
      setHasOpened(true);
    }
  }, [open]);

  if (!(open || hasOpened)) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyNavigationCommandDialog />
    </Suspense>
  );
};
