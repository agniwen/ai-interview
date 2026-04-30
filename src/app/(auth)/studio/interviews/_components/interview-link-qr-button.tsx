"use client";

import { toBlob } from "html-to-image";
import { CopyIcon, QrCodeIcon } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { copyTextToClipboard } from "@/lib/clipboard";

const QR_SIZE = 192;

function buildGreeting(candidateName?: string | null) {
  const name = candidateName?.trim();
  // 候选人姓名缺失时退回到通用称呼，避免出现「您好，：」这种空白尾巴。
  // Fallback to a generic salutation when no candidate name is available.
  if (!name) {
    return "您好！欢迎参加本次面试，请扫描下方二维码进入";
  }
  return `${name} 您好！欢迎参加本次面试，请扫描下方二维码进入`;
}

export function InterviewLinkQrButton({
  url,
  candidateName,
}: {
  url: string;
  candidateName?: string | null;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const greeting = buildGreeting(candidateName);

  async function handleCopy() {
    if (isCopying) {
      return;
    }
    setIsCopying(true);

    try {
      const node = cardRef.current;
      const supportsClipboardItem =
        typeof window !== "undefined" &&
        window.ClipboardItem !== undefined &&
        !!navigator.clipboard?.write;

      if (node && supportsClipboardItem) {
        // pixelRatio = 2 让生成的 PNG 在高分屏上仍然清晰、扫码无锯齿。
        // pixelRatio = 2 keeps the PNG sharp on retina displays so scans stay reliable.
        const blob = await toBlob(node, { cacheBust: true, pixelRatio: 2 });
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          toast.success("分享卡片已复制为图片");
          return;
        }
      }

      // 降级：图片复制不可用时，至少把问候语 + 链接以文本复制出去。
      // Fallback: copy greeting + URL as plain text when image clipboard isn't available.
      const result = await copyTextToClipboard(`${greeting}\n${url}`);
      if (result === "copied") {
        toast.info("当前浏览器不支持复制图片，已复制问候语与链接");
      } else if (result === "manual") {
        toast.info("已弹出文本，请手动复制");
      } else {
        toast.error("复制失败，请手动复制");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制失败");
    } finally {
      setIsCopying(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" type="button" variant="ghost">
          <QrCodeIcon className="size-3.5" />
          二维码
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <div className="flex flex-col items-center gap-3">
          {/* 这张卡片是被截图复制的内容；样式都用直接颜色而非 CSS 变量，
              避免 html-to-image 在跨主题时拿不到正确背景色。*/}
          {/* This card is the screenshotted payload; we use literal colors instead of
              CSS variables so html-to-image renders correctly across themes. */}
          <div
            className="flex w-72 flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-slate-900"
            ref={cardRef}
          >
            <p className="w-full text-left text-sm leading-relaxed">{greeting}</p>
            <div className="rounded-md bg-white p-2">
              <QRCodeCanvas level="M" size={QR_SIZE} value={url} />
            </div>
            <p className="w-full break-all text-center font-mono text-[11px] text-slate-500 leading-relaxed">
              {url}
            </p>
          </div>
          <Button
            className="w-full"
            disabled={isCopying}
            onClick={() => void handleCopy()}
            size="sm"
            type="button"
          >
            <CopyIcon className="size-3.5" />
            {isCopying ? "正在生成图片..." : "复制为图片"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
