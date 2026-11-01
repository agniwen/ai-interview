import { ChromaFlow, FlutedGlass, Shader, Swirl } from "shaders/react";

interface SkyShaderProps {
  dark: boolean;
  onReady: () => void;
  onUnavailable: () => void;
}

// 天空背景：Swirl 铺底色，ChromaFlow 跟随光标晕染，FlutedGlass 加一层棱纹玻璃折射；
// 亮色是晴空蓝，暗色是偏石墨的低饱和钢蓝。构图取自 shaders.com 官方示例。
// 首帧图（sky-backdrop 的 poster）由这里 t=0 的画面导出，改动参数后需要重新导出。
// Sky backdrop: Swirl base, cursor-driven ChromaFlow, fluted-glass refraction on top; based on the
// shaders.com example. Light is clear-sky blue; dark is a muted, graphite-leaning steel blue.
// The poster images are exported from this tree at t=0 — re-export after edits.
export default function SkyShader({ dark, onReady, onUnavailable }: SkyShaderProps) {
  return (
    <Shader
      className="absolute inset-0 size-full"
      disableTelemetry
      onReady={onReady}
      onUnavailable={onUnavailable}
    >
      <Swirl
        blend={50}
        colorA={dark ? "#1e2a48" : "#e8f2ff"}
        colorB={dark ? "#4462a8" : "#a9cdfb"}
        detail={1.7}
      />
      <ChromaFlow
        baseColor={dark ? "#7395e6" : "#3a86ff"}
        downColor={dark ? "#4565c0" : "#1f6fff"}
        leftColor={dark ? "#5f81d8" : "#2a7dff"}
        rightColor={dark ? "#c8d7fb" : "#5e9fff"}
        upColor={dark ? "#96b3f4" : "#4b93ff"}
      />
      <FlutedGlass
        aberration={0.25}
        angle={30}
        frequency={8}
        highlightColor="#ffffff"
        refraction={4}
        softness={0.5}
      />
    </Shader>
  );
}
