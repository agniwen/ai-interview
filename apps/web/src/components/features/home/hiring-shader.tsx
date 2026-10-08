import { FlowingGradient, Shader, SimplexNoise } from "shaders/react";

export default function HiringShader({ dark }: { dark: boolean }) {
  return (
    <Shader className="absolute inset-0 size-full" disableTelemetry>
      <FlowingGradient
        colorA={dark ? "#050b20" : "#f4f7ff"}
        colorB={dark ? "#1230a0" : "#c3d3ff"}
        colorC={dark ? "#1d4dff" : "#3158df"}
        colorD={dark ? "#7b9dff" : "#e6edff"}
        colorSpace="oklab"
        distortion={0.65}
        seed={8}
        speed={0.12}
      />
      <SimplexNoise blendMode="softLight" opacity={0.08} scale={-1.5} speed={0} />
    </Shader>
  );
}
