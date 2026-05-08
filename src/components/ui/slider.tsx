"use client";

import {
  Slider as HeroSlider,
  SliderFill,
  SliderThumb,
  SliderTrack,
  type SliderProps as HeroSliderProps,
} from "@heroui/react";

export type SliderProps = HeroSliderProps;

/**
 * Project Slider wraps Hero UI v3 Slider with the standard Track + Fill + Thumb
 * composition so callers can use a single `<Slider value={[n]} onChange={...} />`.
 * Hero UI Slider supports multi-thumb sliders; we render one Thumb per value.
 */
export function Slider(props: SliderProps) {
  const valueArr = Array.isArray(props.value)
    ? props.value
    : Array.isArray(props.defaultValue)
      ? props.defaultValue
      : [0];
  return (
    <HeroSlider {...props}>
      <SliderTrack>
        <SliderFill />
      </SliderTrack>
      {valueArr.map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <SliderThumb key={i} />
      ))}
    </HeroSlider>
  );
}
