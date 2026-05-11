"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/client/auth-client";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const { data, error } = await authClient.organization.create({
      name: name.trim(),
      slug: slug.trim(),
    });
    setSubmitting(false);
    if (error || !data) {
      toast.error(error?.message ?? "创建工作区失败");
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    router.push(`/w/${data.slug}`);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="ws-name">工作区名</Label>
        <Input id="ws-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ws-slug">URL slug</Label>
        <Input
          id="ws-slug"
          required
          pattern="[a-z0-9-]+"
          placeholder="acme"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">仅可包含小写字母、数字与短横线。</p>
      </div>
      <Button disabled={submitting || !name || !slug} type="submit">
        {submitting ? "创建中..." : "创建工作区"}
      </Button>
    </form>
  );
}
