"use client";

import { LoaderCircleIcon, LogOutIcon } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/client/auth-client";

export function StudioSwitchAccountButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Button
      className="gap-2"
      disabled={isSubmitting}
      onClick={async () => {
        setIsSubmitting(true);

        try {
          await authClient.signOut();
          await router.navigate({ to: "/login" });
          void router.invalidate();
        } finally {
          setIsSubmitting(false);
        }
      }}
      type="button"
      variant="outline"
    >
      {isSubmitting ? (
        <LoaderCircleIcon className="size-4 animate-spin" />
      ) : (
        <LogOutIcon className="size-4" />
      )}
      切换账号
    </Button>
  );
}
