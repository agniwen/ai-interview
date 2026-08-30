import { ImageResponse } from "takumi-js/response";
import { RecruitmentOgCard } from "@/components/og/recruitment-og-card";

const OG_FONT_FAMILY = "Noto Sans SC";
const OG_FONT_TEXT = "招聘 AI 协同工作台覆盖简历筛选面试编排候选人评估端到端工作流";
const OG_IMAGE_SIZE = {
  height: 630,
  width: 1200,
};
const OG_FONT_STYLES = [{ weight: 400 }, { weight: 700 }] as const;

let ogFontsPromise: Promise<{ data: ArrayBuffer; name: string; weight: 400 | 700 }[]> | undefined;

function getAppHostname() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.BETTER_AUTH_URL;

  if (!baseUrl) {
    return "AI Hiring Copilot";
  }

  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "AI Hiring Copilot";
  }
}

function readFontUrl(css: string, weight: number) {
  const fontFacePattern = new RegExp(
    `font-weight:\\s*${weight};[\\s\\S]*?src:\\s*url\\(([^)]+)\\)`,
    "m",
  );
  const match = css.match(fontFacePattern);
  return match?.[1]?.replaceAll(/^["']|["']$/g, "");
}

async function fetchOrThrow(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch OG image asset (${response.status}).`);
  }
  return response;
}

function loadOgFonts() {
  ogFontsPromise ??= (async () => {
    const params = new URLSearchParams({
      family: `${OG_FONT_FAMILY}:wght@400;700`,
      text: OG_FONT_TEXT,
    });
    const cssResponse = await fetchOrThrow(
      `https://fonts.googleapis.com/css2?${params.toString()}`,
    );
    const css = await cssResponse.text();

    return await Promise.all(
      OG_FONT_STYLES.map(async ({ weight }) => {
        const fontUrl = readFontUrl(css, weight);
        if (!fontUrl) {
          throw new Error(`Failed to resolve ${OG_FONT_FAMILY} ${weight} font for OG image.`);
        }

        const fontResponse = await fetchOrThrow(fontUrl);
        const data = await fontResponse.arrayBuffer();
        return { data, name: OG_FONT_FAMILY, weight };
      }),
    );
  })();

  return ogFontsPromise;
}

export async function createOgImageResponse() {
  return new ImageResponse(
    <RecruitmentOgCard
      description="覆盖简历筛选、AI 面试编排、候选人评估的端到端招聘工作流。"
      items={["简历筛选", "AI 面试", "候选人评估"]}
      name="招聘 AI 协同工作台"
      url={getAppHostname()}
    />,
    {
      ...OG_IMAGE_SIZE,
      fonts: await loadOgFonts(),
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
