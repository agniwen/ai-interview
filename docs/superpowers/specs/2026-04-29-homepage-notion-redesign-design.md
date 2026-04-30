# Homepage Notion-style Redesign

## Background

Current homepage (`src/app/_components/home-page-client.tsx`, ~503 lines) consists of a single Hero section (badge + headline + subtitle + dual CTAs) followed by a 4-card highlight grid, then ends. The animated background (DarkVeil + DotGrid in dark, Waves + Prism in light) is well-liked and stays.

The user feels content below the background is too sparse. Goal: extend the homepage into a full Notion-style scrolling landing page while preserving Hero visuals and the existing background system.

## Goals

- Lengthen the homepage with structured, well-paced sections inspired by Notion's marketing site.
- Reuse existing UI primitives in `src/components/ui/` (Button, Tabs, Accordion, Card, etc.); allow `className` overrides; only add new components when no primitive fits.
- Keep current Hero visuals and animated background untouched.
- Use product screenshots taken from the running app; pair theme inversely (dark page → light screenshot, light page → dark screenshot) for contrast.
- Split the current monolithic `home-page-client.tsx` into focused subcomponents.

## Non-Goals

- No changes to background animation components (`react-bits/*`).
- No changes to authentication flow or `SignInRequiredDialog` behavior.
- No new animation libraries; reuse `motion/react` and existing `FadeContent` / `SplitText`.
- No backend or schema changes.

## Page Structure

Sections are stacked vertically inside the existing fixed `ScrollArea`. Background fades out below Hero so long-scroll content reads on a clean surface.

1. **Hero** — preserved: badge, `SplitText` headline, subtitle, dual CTA buttons.
2. **Trust strip** — the 4 existing highlights repurposed as a compact horizontal label row (icon + short label only). Replaces the large card grid.
3. **Product hero shot** — single large screenshot of the primary product surface (chat or studio), framed in a glass card. Theme-inverse asset.
4. **Feature blocks** — three alternating left-text/right-image (and reversed) sections. Each block: eyebrow tag, title, 2–3 sentence description, optional bullet list, screenshot.
   - Block 1: 聊天式简历初筛 (chat surface)
   - Block 2: 岗位语境驱动 + 工作台配置 (studio surface)
   - Block 3: 实时语音模拟面试 (interview surface)
5. **Personas** — three personas in either a 3-column card layout or a left-tab + right-screenshot pattern (decision: 3-column cards for simplicity and mobile fit):
   - HR / 招聘负责人 — 配置岗位、面试问题、面试官设定，启动模拟面试链接，集中查看候选人评估结果。
   - 业务面试官 / 用人经理 — 通过聊天式筛选浏览简历，查看 AI 给出的亮点/风险/追问，决定是否安排深入面试。
   - 候选人 — 通过链接进入实时语音模拟面试，完整经历追问与作答。
6. **Process tabs** — interactive 4-tab switcher (uses `Tabs` from `components/ui/tabs.tsx`):
   - ① 上传 JD ② 简历筛选 ③ 语音面试 ④ 查看评估
   - Each tab shows a large screenshot + step description.
7. **FAQ** — `Accordion` (single-collapsible) with 5 entries:
   - 数据安全（简历/面试录音存储 + 是否训练模型）
   - AI 准确性（评估靠不靠谱、与人工面试关系）
   - 岗位适配（支持的岗位/行业范围）
   - 接入方式（登录、邀请候选人）
   - 语音体验（候选人设备/网络要求）
8. **Secondary CTA** — echoes Hero with primary "开始简历筛选" + secondary "进入工作台". Reuses the same handlers.
9. **Footer** — minimal: product name + 版权 + theme toggle + a couple of placeholder links (产品、登录).

## Visual Design

- **Background fade-out**: a vertical mask gradient on the `-z-10` overlay so the animated background visibly fades to a flat muted surface (`bg-background`) past the Hero. Implementation: extend the existing fixed gradient overlay with a longer stop or layer a second fixed surface.
- **Spacing rhythm**: Notion-style generous vertical spacing (`py-24` to `py-32` per section).
- **Container**: keep `max-w-6xl mx-auto`; allow inner sections to widen to `max-w-7xl` for dual-column blocks.
- **Card style**: continue `rounded-2xl`, `border-primary/15`, `bg-primary/8`, `backdrop-blur` glass language. `ring-1 ring-primary/10` for accent.
- **Entry animation**: `FadeContent` per section with small staggered delay. No new animation framework.
- **Typography**: reuse current Tailwind tokens; section eyebrows use `text-primary text-xs uppercase tracking-wider`; section titles `text-3xl sm:text-4xl font-bold`.

## Screenshots & Assets

- New folder `public/landing/`.
- Required assets (each with `-light.png` and `-dark.png` variants):
  - `chat` — chat surface main view
  - `studio` — studio dashboard / list view
  - `interview` — live voice interview surface
  - `process-1`, `process-2`, `process-3`, `process-4` — process step thumbnails (may reuse cropped versions of the above)
- Screenshots captured via Chrome DevTools MCP against the running dev server, saved into `public/landing/`.
- Optimization: use Next `<Image>` with explicit `width`/`height`. Add `priority` only on the first product hero shot.

## Component Architecture

New folder `src/app/_components/home/`:

- `hero.tsx` — Hero section (extracted from current code).
- `trust-strip.tsx` — small horizontal row of the 4 highlights (icon + label).
- `product-shot.tsx` — single large hero screenshot with framing.
- `feature-blocks.tsx` — 3 alternating blocks; data-driven.
- `personas.tsx` — 3-column persona cards.
- `process-tabs.tsx` — `Tabs`-based step switcher.
- `faq.tsx` — `Accordion`-based FAQ.
- `cta-section.tsx` — secondary CTA row.
- `footer.tsx` — minimal footer.
- `screenshot.tsx` — small wrapper around `<Image>` that picks the inverse-theme asset based on `useTheme().resolvedTheme`. Hydration-safe (mount gate).
- `background-layers.tsx` — extracts the existing background (DarkVeil/DotGrid/Waves/Prism + mask) into one component.

`home-page-client.tsx` becomes a thin composer: background layers, theme toggle, scroll area, and the sequence of section components. The auth / pendingPath logic stays here and is passed down via props or a small context if needed (prefer prop drilling first; both Hero and CtaSection are the only consumers).

## UI Primitives Used

From `src/components/ui/`:

- `Button` — Hero CTAs, CTA section, FAQ etc.
- `Tabs` — process step switcher.
- `Accordion` — FAQ.
- `Card` — feature blocks / personas containers (with className overrides for glass treatment).
- `Badge` — eyebrow tags.
- `Separator` — footer dividers.
- `ScrollArea` — already in use.

`Screenshot` is the only genuinely new component; all other section components are layout compositions.

## Behavior Details

- **Theme-inverse screenshots**: until mounted, render a neutral skeleton (or the dark variant) to avoid hydration mismatch. Same `mounted` pattern already used in `home-page-client.tsx`.
- **Process tabs**: default to tab 1 on mount; controlled state in `process-tabs.tsx`. Image of the inactive tab is unmounted (or hidden) to keep DOM small.
- **FAQ**: single-expand mode (`type="single" collapsible`).
- **Secondary CTA**: same `handleProtectedNavigation` semantics; lifted into a small hook `useProtectedNavigation()` co-located in `home-page-client.tsx` (or in `_components/home/use-protected-navigation.ts` if reused by multiple sections).
- **Trust strip**: no hover halo motion (Notion-clean); the existing magnetic hover overlay is removed when cards become a slim strip.

## Performance

- All section components are server-renderable except those that depend on `useTheme` / `useState` / interactivity (`screenshot.tsx`, `process-tabs.tsx`, `faq.tsx` if uncontrolled, CTA buttons via Hero/CtaSection).
- Extract static section bodies into separate server components where possible; keep client components for interactive bits. (Pragmatic note: current `home-page-client.tsx` is a single client component; we can keep most sections as client too without cost — but mark new ones as server-where-possible to avoid dragging unnecessary JS.)
- Screenshots use `<Image>` with explicit dimensions and `loading="lazy"` for everything below the fold.

## Code Style

- Bilingual comments (zh + en) per repo convention.
- Conventional commits.
- Run `pnpm dlx ultracite fix`, `pnpm typecheck`, `pnpm lint` before commit.

## Out of Scope / Follow-ups

- Real footer link targets (privacy / terms pages) — placeholders only.
- Localized landing copy beyond zh-CN.
- Animated "before/after" or video demos.
- Customer logos / testimonials section (Notion has it; we have none yet).

## Risks

- **Long page perf**: Hero background runs WebGL animations; if the user keeps the bg mounted while scrolling, GPU cost stays. Mitigation: `position: fixed` already; once Hero scrolls out the bg is masked but still rendering. Acceptable for now; future optimization could pause animations when not visible via `IntersectionObserver`.
- **Screenshot drift**: as the app evolves, screenshots will go stale. Document the regeneration command in `public/landing/README.md`.
- **Theme-inverse on system theme**: when `resolvedTheme` is undefined during SSR we render a placeholder. Verify no layout shift.
