import {
  Beam,
  ChromaFlow,
  DiffuseBlur,
  Group,
  Liquify,
  Shader,
  SolidColor,
  Swirl,
} from "shaders/react";

interface BeamShaderProps {
  dark: boolean;
  onReady: () => void;
  onUnavailable: () => void;
}

const BEAM_GROUP_ID = "beam_backdrop_beams";

// 登录页右侧光束卡片：深浅两道蓝色光束作为 Swirl 的遮罩，再经 DiffuseBlur / Liquify 晕开，
// ChromaFlow 跟随光标染色。亮色铺白底；暗色与页面同底，光束取靛蓝与青蓝两种色相、雾用冰蓝点亮，同一蓝系里保留层次。
// Login side card beam backdrop: two blue beams mask a Swirl, softened by DiffuseBlur and Liquify, with a
// cursor-driven ChromaFlow on top. Light uses a white base; dark matches the page and pairs indigo and
// cyan beams with an ice-blue haze, keeping several related blues instead of one.
export default function BeamShader({ dark, onReady, onUnavailable }: BeamShaderProps) {
  const hazeColor = dark ? "#a9c8ff" : "#ffffff";
  return (
    <Shader
      className="absolute inset-0 size-full"
      disableTelemetry
      onReady={onReady}
      onUnavailable={onUnavailable}
    >
      <SolidColor color={dark ? "#14161c" : "#ffffff"} />
      <Group id={BEAM_GROUP_ID}>
        <Beam
          endPosition={{ x: 0.73, y: 0.4 }}
          endSoftness={14.26}
          endThickness={0.6}
          insideColor={dark ? "#3b4fd8" : "#3a90e0"}
          outsideColor={dark ? "#2a3a9e" : "#479ce6"}
          startPosition={{ x: 0.22, y: 0.5 }}
          startSoftness={27.22}
          startThickness={0.33}
        />
        <Beam
          endPosition={{ x: 0.78, y: 0.66 }}
          endSoftness={2.97}
          endThickness={0.7}
          insideColor={dark ? "#1f9ad6" : "#7fb8f5"}
          outsideColor={dark ? "#1b5f9e" : "#9cc9f8"}
          startPosition={{ x: 0.19, y: 0.69 }}
          startSoftness={27.67}
          startThickness={0.21}
        />
      </Group>
      <Swirl
        blend={67}
        blendMode="normal-oklab"
        colorA={hazeColor}
        colorB="#ffffff00"
        colorSpace="oklab"
        detail={1.5}
        maskSource={BEAM_GROUP_ID}
        opacity={dark ? 0.35 : 0.55}
        speed={0}
      />
      <DiffuseBlur intensity={20} />
      <Liquify intensity={5} radius={2} />
      <ChromaFlow
        baseColor={dark ? "#3f5be0" : "#3a90e0"}
        downColor={dark ? "#14161c" : "#eef4fc"}
        intensity={dark ? 0.4 : 0.28}
        leftColor={dark ? "#22b0e866" : "#7fb8f561"}
        rightColor={dark ? "#7a7ff066" : "#3a90e066"}
        upColor={dark ? "#8fd0ff" : "#5e9fff"}
      />
    </Shader>
  );
}
