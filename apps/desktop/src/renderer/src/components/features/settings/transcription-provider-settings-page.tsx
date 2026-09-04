import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deepgramEndpointingMsSchema,
  MEETING_LIVE_TRANSCRIPT_PROVIDER_CAPABILITIES,
  meetingLiveTranscriptProviderSchema,
} from "@app/shared/meeting-transcription";
import type { MeetingLiveTranscriptProviderId } from "@app/shared/meeting-transcription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/settings-ui";
import { orpc } from "@/lib/orpc";
import { updateSettings, useSettings } from "@/lib/settings";

type CredentialStatus = Awaited<ReturnType<typeof orpc.transcriptionProviders.getCredentialStatus>>;

const PROVIDER_LABELS = {
  deepgram: "Deepgram",
  qwen: "DashScope",
} satisfies Record<MeetingLiveTranscriptProviderId, string>;

const CAPABILITIES = [
  ["contextPrompting", "会议上下文"],
  ["liveCorrection", "实时校正"],
  ["speakerDiarization", "说话人拆分"],
  ["utteranceEndpointing", "话语端点"],
  ["vocabulary", "热词"],
  ["wordTimestamps", "词级时间戳"],
] as const;

function CredentialRow({
  configured,
  provider,
  secureStorageAvailable,
  onStatusChange,
}: {
  configured: boolean;
  provider: MeetingLiveTranscriptProviderId;
  secureStorageAvailable: boolean;
  onStatusChange: (status: CredentialStatus) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!apiKey.trim()) {
      return;
    }
    setSaving(true);
    try {
      onStatusChange(await orpc.transcriptionProviders.setCredential({ apiKey, provider }));
      setApiKey("");
      toast.success(`${PROVIDER_LABELS[provider]} API Key 已保存`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "API Key 保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsRow label={`${PROVIDER_LABELS[provider]} API Key`}>
      <div className="flex items-center gap-2">
        <Input
          aria-label={`${PROVIDER_LABELS[provider]} API Key`}
          autoComplete="off"
          disabled={!secureStorageAvailable || saving}
          onBlur={(event) => {
            const nextElement = event.relatedTarget;
            if (
              nextElement instanceof HTMLElement &&
              nextElement.dataset.credentialRemove === provider
            ) {
              return;
            }
            void save();
          }}
          onChange={(event) => setApiKey(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          placeholder={configured ? "已配置，输入新 Key 可替换" : "输入 API Key"}
          type="password"
          value={apiKey}
        />
        {configured && provider === "qwen" ? (
          <Button
            data-credential-remove={provider}
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                onStatusChange(await orpc.transcriptionProviders.clearCredential({ provider }));
                setApiKey("");
                toast.success(`${PROVIDER_LABELS[provider]} API Key 已移除`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "API Key 移除失败");
              } finally {
                setSaving(false);
              }
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            移除
          </Button>
        ) : null}
      </div>
    </SettingsRow>
  );
}

export function TranscriptionProviderSettingsPage(): React.JSX.Element {
  const settings = useSettings();
  const [status, setStatus] = useState<CredentialStatus | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        setStatus(await orpc.transcriptionProviders.getCredentialStatus());
      } catch {
        toast.error("无法读取转录 Provider 凭证状态");
      }
    };
    void loadStatus();
  }, []);

  const capabilities =
    MEETING_LIVE_TRANSCRIPT_PROVIDER_CAPABILITIES[settings.meetingLiveTranscriptProvider];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 pt-12 pb-16">
      <div className="space-y-0.5">
        <h1 className="text-xl font-medium tracking-tight text-foreground">实时转录</h1>
        <p className="text-sm text-muted-foreground">选择录制中的实时转录服务并管理本机凭证。</p>
      </div>

      <SettingsSection
        description="Provider 只影响非权威实时字幕；本地录音不会因 Provider 断线而停止。"
        title="Provider"
      >
        <SettingsGroup>
          <SettingsRow description="下一次开始录制时生效。" label="默认 Provider">
            <Select
              onValueChange={(value) => {
                const parsed = meetingLiveTranscriptProviderSchema.safeParse(value);
                if (parsed.success) {
                  void updateSettings({ meetingLiveTranscriptProvider: parsed.data });
                }
              }}
              value={settings.meetingLiveTranscriptProvider}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="qwen">Qwen 实时语音识别</SelectItem>
                <SelectItem value="deepgram">Deepgram Nova-3</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          {settings.meetingLiveTranscriptProvider === "deepgram" ? (
            <SettingsRow
              description="连续静音达到该时长后，Deepgram 才会结束当前话语。下一次开始录制时生效。"
              label="话语结束静音"
            >
              <Select
                onValueChange={(value) => {
                  const parsed = deepgramEndpointingMsSchema.safeParse(Number(value));
                  if (parsed.success) {
                    void updateSettings({ deepgramEndpointingMs: parsed.data });
                  }
                }}
                value={String(settings.deepgramEndpointingMs)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="500">500 毫秒（响应更快）</SelectItem>
                  <SelectItem value="1000">1 秒（推荐）</SelectItem>
                  <SelectItem value="1500">1.5 秒（更少断句）</SelectItem>
                  <SelectItem value="2000">2 秒（长停顿）</SelectItem>
                </SelectContent>
              </Select>
            </SettingsRow>
          ) : null}
          <SettingsRow label="当前能力">
            <div className="flex flex-wrap justify-end gap-1.5">
              {CAPABILITIES.map(([key, label]) => (
                <span
                  className={
                    capabilities[key]
                      ? "rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-700 text-xs dark:text-emerald-300"
                      : "rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs"
                  }
                  key={key}
                >
                  {label} {capabilities[key] ? "✓" : "—"}
                </span>
              ))}
            </div>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="凭证">
        {status?.secureStorageAvailable === false ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
            当前系统安全存储不可用，暂不能保存新的 API Key。
          </p>
        ) : null}
        <SettingsGroup>
          {(["deepgram", "qwen"] as const).map((provider) => (
            <CredentialRow
              configured={status?.[provider] ?? false}
              key={provider}
              onStatusChange={setStatus}
              provider={provider}
              secureStorageAvailable={status?.secureStorageAvailable ?? false}
            />
          ))}
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}
