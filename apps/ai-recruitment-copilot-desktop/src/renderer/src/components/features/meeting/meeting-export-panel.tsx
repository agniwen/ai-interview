import type { MeetingAccessRole } from "@arc/shared/meeting-recording";
import type { MeetingAudioExportTrack, MeetingExportFormat } from "@arc/shared/meeting-export";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import { meetingExportUrl } from "@/lib/client/meetings";

const EXPORT_OPTIONS: {
  format: MeetingExportFormat;
  label: string;
  track?: MeetingAudioExportTrack;
}[] = [
  { format: "audio", label: "音频" },
  { format: "audio", label: "麦克风源音轨", track: "microphone" },
  { format: "audio", label: "系统源音轨", track: "system" },
  { format: "markdown", label: "Markdown" },
  { format: "txt", label: "TXT" },
  { format: "srt", label: "SRT" },
  { format: "json", label: "JSON" },
];

export function canExportMeeting(role: MeetingAccessRole): boolean {
  return role === "administrator" || role === "owner";
}

async function startMeetingExportDownload(url: string): Promise<void> {
  // 主窗口禁止普通导航；交给 Main 的同一 Electron session 下载，才能携带现有认证 Cookie。
  // Main-window navigation is blocked, so main downloads with the same Electron session and authenticated cookies.
  try {
    const started = await window.api.download.start(url);
    if (!started) {
      toast.error("无法启动会议导出下载");
    }
  } catch {
    toast.error("无法启动会议导出下载");
  }
}

/**
 * 只为 Owner/Admin 暴露当前权威版本的导出入口；真正的 ACL 与导出审计由服务端执行。
 * Exposes current-authoritative exports to owners/admins while the server enforces ACL and audit evidence.
 */
export function MeetingExportPanel({
  accessRole,
  meetingId,
  slug,
}: {
  accessRole: MeetingAccessRole;
  meetingId: string;
  slug: string;
}) {
  if (!canExportMeeting(accessRole)) {
    return null;
  }
  return (
    <Frame>
      <FrameHeader>
        <div>
          <FrameTitle>导出会议资产</FrameTitle>
          <FrameDescription>
            导出当前权威转录、适用的 Meeting Intelligence，或已验证的播放音频。
          </FrameDescription>
        </div>
      </FrameHeader>
      <FramePanel className="flex flex-wrap gap-2">
        {EXPORT_OPTIONS.map((option) => (
          <Button
            data-export-url={meetingExportUrl(slug, meetingId, option.format, option.track)}
            key={`${option.format}:${option.track ?? "default"}`}
            onClick={() => {
              void startMeetingExportDownload(
                meetingExportUrl(slug, meetingId, option.format, option.track),
              );
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {option.label}
          </Button>
        ))}
      </FramePanel>
    </Frame>
  );
}
