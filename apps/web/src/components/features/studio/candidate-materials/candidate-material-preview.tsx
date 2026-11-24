import { getCandidateMaterialBadgeLabel } from "@app/shared/candidate-materials";
import type { CandidateMaterialItem } from "@app/shared/candidate-materials";
import { cn } from "@app/shared/utils";
import { IconChevronLeft, IconChevronRight, IconDownload, IconFile } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Modal } from "@/components/ui/modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const RecruitingMaterialVideo = lazy(() => import("../recruiting-material-video"));

function PreviewLoading() {
  return (
    <output className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      正在加载预览…
    </output>
  );
}

interface ImageDimensions {
  height: number;
  width: number;
}

function CandidateMaterialPreviewMetadata({ item }: { item: CandidateMaterialItem }) {
  return (
    <ScrollArea className="max-h-28" scrollbars="leave">
      <dl
        aria-label="资料信息"
        className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm"
      >
        <dt className="text-muted-foreground">类型</dt>
        <dd>{getCandidateMaterialBadgeLabel(item)}</dd>
        {item.fileName ? (
          <>
            <dt className="text-muted-foreground">文件名</dt>
            <dd className="break-all">{item.fileName}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">说明</dt>
        <dd className="wrap-anywhere whitespace-pre-wrap">{item.notes || "暂无说明"}</dd>
      </dl>
    </ScrollArea>
  );
}

function CandidateMaterialPreviewContent({
  item,
  onDimensions,
  size,
  url,
  viewport,
}: {
  item: CandidateMaterialItem;
  onDimensions: (dimensions: ImageDimensions) => void;
  size: string;
  url: string;
  viewport: RefObject<HTMLDivElement | null>;
}) {
  const contentType = item.contentType ?? "application/octet-stream";
  const isVideo = contentType.startsWith("video/");
  const fileName = item.fileName ?? item.title;
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
          throw new Error("Material preview failed");
        }
        const blob = await response.blob();
        if (controller.signal.aborted) {
          return;
        }
        objectUrl = URL.createObjectURL(blob.slice(0, blob.size, contentType));
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
  }, [url, contentType]);

  return (
    <div
      ref={viewport}
      className="relative min-h-0 flex-1 overflow-auto overscroll-contain"
      aria-label="资料预览画布"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Image viewport accepts keyboard scrolling at original size.
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
                filename={fileName}
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
              {/* oxlint-disable-next-line next/no-img-element -- Authenticated material is rendered from a local blob URL. */}
              <img
                src={source}
                alt={fileName}
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

export function CandidateMaterialPreview({
  item,
  navigation,
  onClose,
  url,
}: {
  item: CandidateMaterialItem;
  navigation?: {
    index: number;
    onNext: () => void;
    onPrevious: () => void;
    total: number;
  };
  onClose: () => void;
  url: string;
}) {
  const contentType = item.contentType ?? "";
  const isVideo = item.kind === "file" && contentType.startsWith("video/");
  const isImage = item.kind === "file" && contentType.startsWith("image/");
  let previewLabel = "资料预览";
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
  const downloadName = item.fileName ?? item.title;

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={item.title}
      description={`${previewLabel}${dimensions ? ` · ${dimensions.width} × ${dimensions.height}` : ""}`}
      size="3xl"
      className="h-[min(84dvh,900px)]"
      bodyClassName="flex min-h-0 overflow-hidden bg-muted/30 p-0"
      headerExtra={
        <div className="mt-2 flex min-w-0 flex-col gap-3">
          <CandidateMaterialPreviewMetadata item={item} />
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
            <div className="flex items-center gap-2" aria-label="资料切换">
              <Button
                variant="outline"
                size="icon"
                aria-label="上一份资料"
                title="上一份资料"
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
                aria-label="下一份资料"
                title="下一份资料"
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
            render={<a href={url} download={downloadName} aria-label={downloadLabel} />}
          >
            <IconDownload data-icon="inline-start" />
            {downloadLabel}
          </Button>
        </div>
      }
    >
      {isImage || isVideo ? (
        <CandidateMaterialPreviewContent
          key={url}
          item={item}
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
            <EmptyTitle>此资料暂不支持在线预览</EmptyTitle>
            <EmptyDescription>可下载原文件查看，或继续切换其他资料。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </Modal>
  );
}
