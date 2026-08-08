import { Switch } from "@/components/ui/switch";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/settings-ui";
import { updateSettings, useSettings } from "@/lib/settings";
import { MeetingTranscriptionPolicyPanel } from "./meeting-transcription-policy-panel";

export function GeneralSettingsPage(): React.JSX.Element {
  const settings = useSettings();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6 pb-16">
      <div className="space-y-0.5">
        <h1 className="text-xl font-medium tracking-tight text-foreground">通用</h1>
        <p className="text-sm text-muted-foreground">应用运行相关的通用偏好。</p>
      </div>

      <SettingsGroup>
        <SettingsRow
          description="录制完成后发送系统通知。"
          htmlFor="notify-on-finish"
          label="录制结束系统通知"
        >
          <div className="flex justify-end">
            <Switch
              checked={settings.notifyOnFinish}
              id="notify-on-finish"
              onCheckedChange={(checked) => {
                void updateSettings({ notifyOnFinish: checked });
              }}
            />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsSection
        description="管理员明确允许并选择 Final Meeting Transcript provider。录制阶段仍保持纯本地。"
        title="会议最终转录"
      >
        <MeetingTranscriptionPolicyPanel />
      </SettingsSection>
    </div>
  );
}
