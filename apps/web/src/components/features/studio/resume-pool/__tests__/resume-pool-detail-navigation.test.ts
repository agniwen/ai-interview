import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResumePoolDetailPageSkeleton } from "../resume-pool-detail-page";

describe("resume pool detail navigation", () => {
  it("keeps the pool list mounted behind an internal overlay route", async () => {
    const [pageSource, routeSource] = await Promise.all([
      readFile(new URL("../resume-pool-page.tsx", import.meta.url), "utf-8"),
      readFile(
        new URL("../../../../../routes/w.$slug.studio.resume-pool.tsx", import.meta.url),
        "utf-8",
      ),
    ]);

    expect(pageSource).toContain('getRouteApi("/w/$slug/studio/resume-pool/overlay/$recordId")');
    expect(pageSource).toContain('to: "/w/$slug/studio/resume-pool/overlay/$recordId"');
    expect(pageSource).toContain("resetScroll: false");
    expect(routeSource).toContain(
      'activeRouteId === "/w/$slug/studio/resume-pool/overlay/$recordId"',
    );
    expect(routeSource).toContain("isListRoute || isOverlayRoute");
    expect(routeSource).toContain("inert={isOverlayRoute ? true : undefined}");
  });

  it("maps the overlay route to a canonical shareable detail URL", async () => {
    const routerSource = await readFile(
      new URL("../../../../../router.tsx", import.meta.url),
      "utf-8",
    );

    expect(routerSource).toContain('from: "/w/$slug/studio/resume-pool/overlay/$recordId"');
    expect(routerSource).toContain('to: "/w/$slug/studio/resume-pool/$recordId"');
    expect(routerSource).toContain("unmaskOnReload: true");
  });

  it("places the joined-at filter after the other filtering conditions", async () => {
    const pageSource = await readFile(new URL("../resume-pool-page.tsx", import.meta.url), "utf-8");

    expect(pageSource.indexOf('key: "createdAtRange"')).toBeGreaterThan(
      pageSource.indexOf('key: "importStatus"'),
    );
  });

  it("matches the loaded detail structure in its loading skeleton", () => {
    const html = renderToStaticMarkup(createElement(ResumePoolDetailPageSkeleton));

    expect(html).toContain('aria-label="正在加载人才详情"');
    expect(html).toContain('data-resume-pool-detail-skeleton="qualitative-evaluation"');
    expect(html.match(/data-resume-pool-detail-skeleton="summary-item"/gu)).toHaveLength(8);
    expect(html.match(/data-resume-pool-detail-skeleton="structured-section"/gu)).toHaveLength(6);
  });

  it("uses a name seed and renders a compact record id beside the detail title", async () => {
    const detailSource = await readFile(
      new URL("../resume-pool-detail-page.tsx", import.meta.url),
      "utf-8",
    );

    expect(detailSource).toContain("seed={candidateName}");
    expect(detailSource).toContain("text-[14px] text-muted-foreground/60");
    expect(detailSource).toContain("formatResumeRecordDisplayId(detail.id)");
  });

  it("places the qualitative evaluation before the candidate summary without a structured separator", async () => {
    const [detailPageSource, detailsSource] = await Promise.all([
      readFile(new URL("../resume-pool-detail-page.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../resume-pool-details.tsx", import.meta.url), "utf-8"),
    ]);

    expect(detailPageSource.indexOf("<ResumePoolQualitativeEvaluationPanel")).toBeLessThan(
      detailPageSource.indexOf("<ResumePoolDetailSummaryPanel"),
    );
    expect(detailsSource.indexOf("<ResumePoolQualitativeEvaluationPanel")).toBeLessThan(
      detailsSource.indexOf("<ResumePoolDetailSummaryPanel"),
    );
    expect(detailPageSource).not.toContain('<section className="border-border/60 border-t pt-7">');
  });
});
