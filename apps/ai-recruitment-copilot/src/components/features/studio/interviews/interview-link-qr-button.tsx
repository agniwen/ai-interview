"use client";

import { IconChevronDown, IconLink, IconQrcode, IconSend } from "@tabler/icons-react";
import { snapdom } from "@zumer/snapdom";

import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyTextToClipboard } from "@/lib/client/clipboard";

const QR_SIZE = 192;

function buildSalutation(candidateName?: string | null) {
  const name = candidateName?.trim();
  // 候选人姓名缺失时退回到通用称呼，避免出现「您好，：」这种空白尾巴。
  // Fallback to a generic salutation when no candidate name is available.
  if (!name) {
    return "您好";
  }
  return `${name} 您好`;
}

function buildQrGreeting(candidateName?: string | null) {
  return `${buildSalutation(candidateName)}！欢迎参加本次面试，请扫描下方二维码进入`;
}

function buildCandidateMessage(url: string, candidateName?: string | null) {
  const greeting = `${buildSalutation(candidateName)}！欢迎参加本次面试，请通过下方链接进入`;
  return `${greeting}\n\n面试链接：${url}`;
}

export function InterviewLinkQrButton({
  url,
  candidateName,
  className,
  disabled,
}: {
  url: string;
  candidateName?: string | null;
  className?: string;
  // 外部锁定（如候选人已推进到 AI 面试之后的阶段）。
  // External lock (e.g. candidate has moved past AI interview).
  disabled?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const greeting = buildQrGreeting(candidateName);
  const candidateMessage = buildCandidateMessage(url, candidateName);

  async function copyPlainLink() {
    try {
      const result = await copyTextToClipboard(url);
      if (result === "copied") {
        toast.success("面试链接已复制");
        return;
      }
      if (result === "manual") {
        toast.info("已弹出链接，请手动复制");
        return;
      }
      toast.error("复制失败，请手动复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  async function copyCandidateMessage() {
    try {
      const result = await copyTextToClipboard(candidateMessage);
      if (result === "copied") {
        toast.success("已复制给候选人的消息");
        return;
      }
      if (result === "manual") {
        toast.info("已弹出消息，请手动复制");
        return;
      }
      toast.error("复制失败，请手动复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  async function copyQrImage() {
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
        const blob = await snapdom.toBlob(node, {
          backgroundColor: "#ffffff",
          scale: 2,
          type: "png",
        });
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          toast.success("二维码已复制为图片");
          return;
        }
      }

      // 降级：图片复制不可用时，至少把问候语 + 链接以文本复制出去。
      // Fallback: copy greeting + URL as plain text when image clipboard isn't available.
      const result = await copyTextToClipboard(candidateMessage);
      if (result === "copied") {
        toast.info("当前浏览器不支持复制图片，已复制候选人消息");
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
    <>
      <ButtonGroup className={className}>
        <Button
          disabled={disabled}
          onClick={() => void copyPlainLink()}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconLink className="size-3.5" />
          复制链接
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={
              <Button disabled={disabled} size="icon-sm" type="button" variant="ghost">
                <IconChevronDown className="size-3.5" />
                <span className="sr-only">打开分享选项</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled={isCopying} onClick={() => void copyQrImage()}>
              <IconQrcode className="size-3.5" />
              {isCopying ? "正在生成..." : "复制二维码"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void copyCandidateMessage()}>
              <IconSend className="size-3.5" />
              复制给候选人
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>

      {/* 这张离屏卡片是 snapdom 截图源；用直接颜色避免跨主题变量解析偏差。 */}
      {/* Offscreen snapdom source; literal colors keep rendering stable across themes. */}
      <div aria-hidden className="pointer-events-none fixed top-0 left-[-10000px] opacity-0">
        <div
          className="flex w-72 flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-slate-900"
          ref={cardRef}
        >
          <p className="w-full text-left text-sm leading-normal">{greeting}</p>
          <div className="rounded-md bg-white p-2">
            <QRCodeCanvas level="M" size={QR_SIZE} value={url} />
          </div>
          <p className="w-full break-all text-center font-mono text-[11px] text-slate-500 leading-normal">
            {url}
          </p>
        </div>
      </div>
    </>
  );
}
