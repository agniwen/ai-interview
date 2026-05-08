"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function StudioSwitchAccountButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Button
      className="gap-2"
      isPending={isSubmitting}
      onClick={async () => {
        setIsSubmitting(true);

        try {
          await authClient.signOut();
          router.replace("/login");
          router.refresh();
        } finally {
          setIsSubmitting(false);
        }
      }}
      type="button"
      variant="outline"
    >
      <LogOutIcon className="size-4" />
      切换账号
    </Button>
  );
}
