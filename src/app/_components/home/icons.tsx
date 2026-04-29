// 用途：首页特性图标集合（从 home-page-client 抽出）
// Purpose: feature icons for the homepage, extracted from home-page-client.
"use client";

import type { SVGProps } from "react";

export type FeatureIconProps = SVGProps<SVGSVGElement>;

export const ResumeRadarIcon = ({ className, ...props }: FeatureIconProps) => (
  <svg
    className={className}
    fill="none"
    role="img"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>简历雷达图标</title>
    <path
      d="M13 7.5h15.5L36 15v25.5H13z"
      fill="currentColor"
      fillOpacity="0.12"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path d="M28.5 7.5V15H36" stroke="currentColor" strokeWidth="2.5" />
    <path
      d="M18 18h10M18 24h7M18 30h5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
    <path
      d="M31 28.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
      fill="currentColor"
      fillOpacity="0.2"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path d="m35 38.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
    <path d="M31 31.5v3h3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    <path
      d="M9 12h4M9 22h4M9 32h4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
  </svg>
);

export const RoleContextIcon = ({ className, ...props }: FeatureIconProps) => (
  <svg
    className={className}
    fill="none"
    role="img"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>岗位语境图标</title>
    <path
      d="M10 17h28v22H10z"
      fill="currentColor"
      fillOpacity="0.12"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path
      d="M18 17v-4.5A3.5 3.5 0 0 1 21.5 9h5a3.5 3.5 0 0 1 3.5 3.5V17"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path d="M10 25h28" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
    <path
      d="M16 31h6M27 31h5M16 35h3M27 35h7"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.2"
    />
    <path d="M24 23.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" fill="currentColor" />
    <path
      d="M7 11h5M36 11h5M7 43h5M36 43h5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
  </svg>
);

export const VoiceInterviewIcon = ({ className, ...props }: FeatureIconProps) => (
  <svg
    className={className}
    fill="none"
    role="img"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>语音面试图标</title>
    <path
      d="M24 6.5 36.5 12v9.5c0 8.2-4.9 15.6-12.5 19.8-7.6-4.2-12.5-11.6-12.5-19.8V12z"
      fill="currentColor"
      fillOpacity="0.12"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
    <path
      d="M18 25c1.7-4.4 3.4-6.6 5.2-6.6 2.6 0 2.4 6.6 5.2 6.6 1.4 0 2.6-1.2 3.6-3.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
    <path
      d="M17 31h14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.55"
      strokeWidth="2"
    />
    <path
      d="M19 13.5h10M24 9.5v8"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
    <path
      d="M8 21h3M37 21h3M9 28h3M36 28h3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
  </svg>
);

export const WorkflowLinkIcon = ({ className, ...props }: FeatureIconProps) => (
  <svg
    className={className}
    fill="none"
    role="img"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>筛选联动图标</title>
    <path
      d="M12 12h12v10H12zM24 26h12v10H24z"
      fill="currentColor"
      fillOpacity="0.12"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path
      d="M24 17h5a5 5 0 0 1 5 5v4M24 31h-5a5 5 0 0 1-5-5v-4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
    <path
      d="m31 23 3 3 3-3M17 25l-3-3-3 3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
    <path
      d="M17 17h2M29 31h2"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.65"
      strokeWidth="2"
    />
    <path
      d="M8 8h4M36 8h4M8 40h4M36 40h4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity="0.45"
      strokeWidth="2"
    />
  </svg>
);
