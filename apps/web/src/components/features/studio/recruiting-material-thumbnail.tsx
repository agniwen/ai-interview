import { useEffect, useState } from "react";
import { IconPhoto } from "@tabler/icons-react";
import { AttachmentMedia } from "@/components/ui/attachment";
import { runAsyncAction } from "@/lib/client/async-control";

export function RecruitingMaterialThumbnail({ url, filename }: { url: string; filename: string }) {
  const [source, setSource] = useState<{ url: string; objectUrl: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void runAsyncAction({
      operation: async () => {
        const response = await fetch(url, { credentials: "include", signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const blob = await response.blob();
        if (controller.signal.aborted) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSource({ objectUrl, url });
        setFailed(false);
      },
    });
    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  const imageUrl = source?.url === url ? source.objectUrl : null;
  return (
    <AttachmentMedia variant={imageUrl && !failed ? "image" : "icon"}>
      {imageUrl && !failed ? (
        // User attachments are fetched with authentication and rendered from local blob URLs.
        // oxlint-disable-next-line next/no-img-element -- Blob URLs are not handled by an image optimization service.
        <img
          alt={filename}
          src={imageUrl}
          className="size-full object-cover"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <IconPhoto />
      )}
    </AttachmentMedia>
  );
}
