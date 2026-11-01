import "media-chrome/lang/zh-CN";
import { setLanguage } from "media-chrome/utils/i18n";
import {
  VideoPlayer,
  VideoPlayerContent,
  VideoPlayerControlBar,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerSeekBackwardButton,
  VideoPlayerSeekForwardButton,
  VideoPlayerTimeDisplay,
  VideoPlayerTimeRange,
  VideoPlayerVolumeRange,
} from "@/components/kibo-ui/video-player";

setLanguage("zh-CN");

export default function RecruitingMaterialVideo({
  src,
  filename,
  onError,
}: {
  src: string;
  filename: string;
  onError: () => void;
}) {
  return (
    <VideoPlayer className="block size-full" aria-label={filename} noAutohide>
      <VideoPlayerContent
        slot="media"
        src={src}
        aria-label={filename}
        className="h-[calc(100%-5.5rem)] w-full object-contain"
        playsInline
        preload="metadata"
        onError={onError}
      />
      <VideoPlayerTimeRange className="w-full" aria-label="播放进度" />
      <VideoPlayerControlBar className="w-full">
        <VideoPlayerPlayButton aria-label="播放 / 暂停" />
        <VideoPlayerSeekBackwardButton seekOffset={10} aria-label="后退 10 秒" />
        <VideoPlayerSeekForwardButton seekOffset={10} aria-label="前进 10 秒" />
        <VideoPlayerTimeDisplay showDuration />
        <VideoPlayerMuteButton aria-label="静音 / 取消静音" />
        <VideoPlayerVolumeRange className="hidden sm:block" aria-label="音量" />
      </VideoPlayerControlBar>
    </VideoPlayer>
  );
}
