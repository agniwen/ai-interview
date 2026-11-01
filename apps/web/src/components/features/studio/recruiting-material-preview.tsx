import { incomeProofTypeLabels } from "@app/shared/recruiting-materials";
import type { RecruitingMaterialMetadata } from "@app/shared/recruiting-materials";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconChevronLeft, IconChevronRight, IconDownload, IconFile } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { cn } from "@app/shared/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Modal } from "@/components/ui/modal";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import type { RefObject } from "react";

const RecruitingMaterialVideo = lazy(() => import("./recruiting-material-video"));

function PreviewLoading() {
  return (
    <output className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      正在加载预览…
    </output>
  );
}

interface PreviewFile extends Partial<RecruitingMaterialMetadata> {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}
function MaterialPreviewMetadata({ file }: { file: PreviewFile }) {
  return (
    <ScrollArea className="max-h-32" scrollbars="leave">
      <dl
        aria-label="附件信息"
        className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm"
      >
        <dt className="text-muted-foreground">类型</dt>
        <dd>{file.incomeType ? incomeProofTypeLabels[file.incomeType] : "未标记"}</dd>
        <dt className="text-muted-foreground">备注</dt>
        <dd className="wrap-anywhere whitespace-pre-wrap">{file.notes || "暂无备注"}</dd>
      </dl>
    </ScrollArea>
  );
}

interface ImageDimensions {
  width: number;
  height: number;
}

// Remount only the media, keeping the dialog and navigation focus stable between attachments.
function MaterialPreviewContent({
  file,
  url,
  size,
  viewport,
  onDimensions,
}: {
  file: PreviewFile;
  url: string;
  size: string;
  viewport: RefObject<HTMLDivElement | null>;
  onDimensions: (dimensions: ImageDimensions) => void;
}) {
  const isVideo = file.contentType.startsWith("video/");
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    async function load() {
      try {
        const response = await fetch(url, { credentials: "include", signal: controller.signal });
        if (!response.ok) {
          throw new Error("Attachment preview failed");
        }
        const blob = await response.blob();
        if (controller.signal.aborted) {
          return;
        }
        // Download responses deliberately use octet-stream; restore the recorded media type locally.
        objectUrl = URL.createObjectURL(blob.slice(0, blob.size, file.contentType));
        setSource(objectUrl);
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url, file.contentType]);

  return (
    <div
      ref={viewport}
      className="relative min-h-0 flex-1 overflow-auto overscroll-contain"
      aria-label="附件预览画布"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The image viewport must accept keyboard scrolling at original size.
      tabIndex={0}
    >
      {failed ? (
        <div className="flex h-full items-center justify-center p-6">
          <Alert className="max-w-sm">
            <AlertTitle>{isVideo ? "视频无法预览" : "图片加载失败"}</AlertTitle>
            <AlertDescription>
              {isVideo
                ? "文件加载失败或浏览器不支持此视频格式，请下载原文件查看。"
                : "请重新打开预览，或下载原文件查看。"}
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <>
          {!source || (!isVideo && !imageLoaded) ? <PreviewLoading /> : null}
          {source && isVideo ? (
            <Suspense fallback={<PreviewLoading />}>
              <RecruitingMaterialVideo
                src={source}
                filename={file.fileName}
                onError={() => setFailed(true)}
              />
            </Suspense>
          ) : null}
          {source && !isVideo ? (
            <div
              className={cn(
                "flex p-4 sm:p-8",
                size === "fit"
                  ? "size-full items-center justify-center"
                  : "min-h-full min-w-full w-max",
              )}
            >
              {/* oxlint-disable-next-line next/no-img-element -- Authenticated attachment is a local blob, not an optimizable public image. */}
              <img
                src={source}
                alt={file.fileName}
                className={cn(
                  size === "fit"
                    ? "size-full object-contain"
                    : "m-auto h-auto w-auto max-w-none shrink-0",
                  !imageLoaded && "opacity-0",
                )}
                onLoad={(event) => {
                  setImageLoaded(true);
                  onDimensions({
                    height: event.currentTarget.naturalHeight,
                    width: event.currentTarget.naturalWidth,
                  });
                }}
                onError={() => setFailed(true)}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function RecruitingMaterialPreview({
  file,
  url,
  onClose,
  navigation,
}: {
  file: PreviewFile;
  url: string;
  onClose: () => void;
  navigation?: { index: number; total: number; onPrevious: () => void; onNext: () => void };
}) {
  const isVideo = file.contentType.startsWith("video/");
  const isImage = file.contentType.startsWith("image/");
  let previewLabel = "附件预览";
  let downloadLabel = "下载原文件";
  if (isVideo) {
    previewLabel = "视频预览";
    downloadLabel = "下载原视频";
  } else if (isImage) {
    previewLabel = "图片预览";
    downloadLabel = "下载原图片";
  }
  const [imageSize, setImageSize] = useState({ url, value: "fit" });
  const size = imageSize.url === url ? imageSize.value : "fit";
  const [imageDimensions, setImageDimensions] = useState<
    (ImageDimensions & { url: string }) | null
  >(null);
  const dimensions = imageDimensions?.url === url ? imageDimensions : null;
  const viewport = useRef<HTMLDivElement>(null);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={file.fileName}
      description={`${previewLabel}${dimensions ? ` · ${dimensions.width} × ${dimensions.height}` : ""}`}
      size="3xl"
      className="h-[min(84dvh,900px)]"
      bodyClassName="flex min-h-0 overflow-hidden bg-muted/30 p-0"
      headerExtra={
        <div className="mt-2 flex min-w-0 flex-col gap-3">
          <MaterialPreviewMetadata file={file} />
          {isImage ? (
            <ToggleGroup
              aria-label="图片显示大小"
              value={[size]}
              onValueChange={(value) => {
                if (value[0]) {
                  setImageSize({ url, value: value[0] });
                  viewport.current?.scrollTo({ left: 0, top: 0 });
                }
              }}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              <ToggleGroupItem value="fit">适配大小</ToggleGroupItem>
              <ToggleGroupItem value="original">原始大小</ToggleGroupItem>
            </ToggleGroup>
          ) : null}
        </div>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {navigation && navigation.index >= 0 && navigation.total > 1 ? (
            <div className="flex items-center gap-2" aria-label="附件切换">
              <Button
                variant="outline"
                size="icon"
                aria-label="上一个附件"
                title="上一个附件"
                disabled={navigation.index <= 0}
                onClick={navigation.onPrevious}
              >
                <IconChevronLeft />
              </Button>
              <span
                className="min-w-12 text-center text-sm text-muted-foreground tabular-nums"
                aria-live="polite"
                aria-atomic="true"
              >
                {navigation.index + 1} / {navigation.total}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="下一个附件"
                title="下一个附件"
                disabled={navigation.index >= navigation.total - 1}
                onClick={navigation.onNext}
              >
                <IconChevronRight />
              </Button>
            </div>
          ) : (
            <span />
          )}
          <Button
            nativeButton={false}
            variant="outline"
            render={<a href={url} download={file.fileName} aria-label={downloadLabel} />}
          >
            <IconDownload data-icon="inline-start" />
            {downloadLabel}
          </Button>
        </div>
      }
    >
      {isImage || isVideo ? (
        <MaterialPreviewContent
          key={url}
          file={file}
          url={url}
          size={size}
          viewport={viewport}
          onDimensions={(value) => setImageDimensions({ ...value, url })}
        />
      ) : (
        <Empty className="m-auto">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconFile />
            </EmptyMedia>
            <EmptyTitle>此附件暂不支持在线预览</EmptyTitle>
            <EmptyDescription>可下载原文件查看，或继续切换其他附件。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </Modal>
  );
}
