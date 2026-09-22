# 数据看板设计验收

## Evidence

- Source visual truth: `/Users/guang/.codex/generated_images/01a09f6f-634e-78e3-959c-d0171548e9f4/exec-d304a132-8de5-4535-aaf7-b662a53f2fc3.png`
- Source pixels: 1487 × 1058, density unknown
- Implementation: `http://localhost:3000/w/light/studio/dashboard`
- Implementation screenshot: Codex Chrome capture in this task; the browser session stopped before the capture could be persisted to a local file
- Viewports checked: default Chrome desktop viewport and temporary 390 × 844 CSS px mobile viewport; the temporary override was reset
- State: light theme, workspace `light`, populated dashboard; metric-definition modal checked on desktop and mobile
- Density normalization: not completed because the implementation capture could not be persisted

## Full-view comparison evidence

- The implemented information hierarchy follows the selected direction: six operating metrics, cumulative conversion funnel with risk/todos, HR progress table, then 30-day activity and AI/Offer results.
- The intentionally approved changes are present: no department/job/HR filters, no data-update timestamp, and a single “指标说明” action.
- Existing product navigation, light-theme tokens, card radii, borders, typography, and Tabler icon language are retained.

## Focused region comparison evidence

- Header: title, subtitle and metric-description action were inspected in the rendered page.
- KPI row: the first desktop pass wrapped into two rows; it was changed to a six-column desktop row and card copy was stacked to prevent label wrapping.
- Funnel/risk area: cumulative bars, percentages, current todo counts, vacancy rows and unconfigured-headcount note were inspected with live workspace data.
- HR table: the first implementation omitted the source design's “待处理” column; the metric, query and table column were added.
- Results card: the first implementation emphasized 30-day counts only; it was realigned to AI launch rate, AI completions, offers sent and accepted Offer status.
- Mobile: 390 × 844 showed no document-level horizontal overflow; the metric-definition modal became a bottom sheet and remained readable.

## Required fidelity surfaces

- Fonts and typography: uses the existing application font stack and hierarchy; no custom display font was introduced. Labels use 12–14 px text, metric values use tabular numerals, and long card copy truncates rather than changing grid width.
- Spacing and layout rhythm: follows the source's compact dashboard order and the product's existing 12/16/20/24 px spacing rhythm. Desktop KPI layout was corrected to one row.
- Colors and visual tokens: uses existing background, border, foreground and semantic tokens, with blue/violet/amber/green/rose accents matching the source's metric categories.
- Image quality and asset fidelity: the screen contains no raster imagery; all visible functional symbols use the repository's existing Tabler icon package. No placeholder or handcrafted SVG asset was introduced.
- Copy and content: uses the agreed Chinese labels and adds calculation definitions for scope, cache behavior, funnel, HR progress, 30-day activity and Offer status.

## Comparison history

1. P1 — Desktop KPI cards rendered as a 3 × 2 grid instead of one row. Fixed by switching the desktop breakpoint to six columns; the revised browser capture showed all six cards in one row.
2. P2 — KPI label and helper text competed for one line. Fixed by stacking helper text beneath the label.
3. P1 — HR progress omitted “待处理”. Fixed in the shared contract, server aggregation, table and metric documentation.
4. P1 — The result card did not match the source's AI/Offer emphasis. Fixed to show AI launch rate, AI completions, Offers sent and accepted Offer status.

## Findings

- No known functional P0/P1/P2 issue remains after implementation and code-level verification.
- QA evidence is incomplete: the final post-fix Chrome screenshot could not be persisted or normalized after browser control was stopped on an unsupported foreground URL.

## Implementation checklist

- [x] Remove dashboard filters and update timestamp
- [x] Add six operating metrics and vacancy calculation
- [x] Use cumulative funnel semantics
- [x] Add risk/todo and vacancy detail rows
- [x] Add HR owner aggregation including pending work
- [x] Add metric-definition modal
- [x] Verify API with the local workspace dataset
- [x] Check desktop and 390 × 844 responsive behavior
- [ ] Persist and normalize one final post-fix Chrome screenshot for the design record

## Final result

final result: blocked

Blocker: the final browser-rendered screenshot artifact and exact viewport metadata are unavailable, so the mandatory post-fix visual evidence cannot be completed in this run.

---

# Candidate invitation confirmation — 2026-09-10

> Superseded by the user's later unified dark-entry design. The illustration concept below is historical, not the current visual target.

- Source visual truth: `/Users/apple/.codex/generated_images/01a01455-8f77-7fe0-90c2-84aa1208e56f/exec-9997f9b5-7f84-4ad6-bf4e-6b909bcfffbc.png` (selected first option).
- Scope: candidate confirmation and existing declined/expired preview states only; interviewer, accepted-candidate entry, and LiveKit views unchanged.
- Implementation screenshot: unavailable. The in-app browser opened the supplied localhost URL but redirected to an unrelated external site. No interactions were performed there.
- Viewport: target desktop 1440 × 1024; generated reference displayed at 1487 × 1058. Implementation viewport and density could not be verified; normalization not performed.
- State: candidate invitation pending; source uses 张居正 and 2026-09-10 14:23.

## Comparison evidence and findings

Full-view and focused-region comparison are blocked by the unexpected browser redirect. No visual pass is claimed from source inspection or unit tests.

- Fonts/typography: implementation reuses the app font, centered heading, job/meeting title and readable helper text; rendered fidelity unverified.
- Spacing/layout: full-width background, centered max-width content, responsive stacked actions; desktop/mobile rendering unverified.
- Colors/tokens: candidate-only light/dark palette, retaining original meeting palette outside the component. Primary uses the existing accessible sage/dark-text pair instead of the mock's white button text.
- Image quality: reuses the actual existing AI interview light/dark artwork, not the generated screenshot as a background; crop and rendered fidelity unverified.
- Copy/content: source greeting/actions preserved, actual title/time used; response callbacks unchanged. No invented interviewer details or notification promises.
- Automated interaction coverage: acceptance/decline callbacks, pending disables both actions, declined/expired hides actions, local theme does not mutate document/body, missing time fallback.

## Comparison history

Initial visual check blocked by browser redirect; no visual fixes inferred from the unrelated site.

## Implementation checklist

- Restore access to the local interview application in the browser.
- Capture the pending screen at source aspect ratio and a mobile width, compare alongside the selected source.
- Check local theme toggle, focus/hover states and browser console; do not submit a real invitation response during visual QA.

final result: blocked

## Updated target — unified dark entry

- User selected the existing candidate entry screenshot `/var/folders/5j/yml3zj3x6z5g3rvvv2wdy0c80000gn/T/codex-clipboard-8818d5ba-b1d8-45db-9e4e-d62432e73a9c.png` (1559 × 1023) instead of the generated light concept.
- Candidate confirmation now uses the same dark background, centered max-width-lg content, size-14 video icon, text-2xl title and existing button variants as entry. Removed the newly introduced candidate-only CSS and appearance control; original AI artwork files remain untouched.
- Accept/decline, rejected/expired and pending semantics remain unchanged. Interviewer and accepted-candidate entry markup is unchanged.
- Fonts, spacing, colors, icons and content were checked against existing entry code and the supplied target screenshot; no browser-rendered same-state comparison is available because of the previously observed unrelated-site redirect. No visual pass is claimed.
- Next: capture candidate pending screen and compare to this updated target; obsolete light-theme checks above no longer apply.

final result: blocked

---

# Recruiting ledger multi-select design QA

- Source visual truth: `/var/folders/n3/c8rthkfs05x77761sfm6vrb40000gn/T/codex-clipboard-4dc786d6-d16e-437d-8554-ec91e0268933.jpg`
- Implementation screenshot: `/Users/guang/.codex/visualizations/2026/09/21/01a0c2f3-6351-7cc0-80b3-85ee47a18dbd/recruiting-ledger-multiselect-empty-2360x1386.png`
- Full-view comparison: `/Users/guang/.codex/visualizations/2026/09/21/01a0c2f3-6351-7cc0-80b3-85ee47a18dbd/recruiting-ledger-comparison-empty.png`
- Focused filter comparison: `/Users/guang/.codex/visualizations/2026/09/21/01a0c2f3-6351-7cc0-80b3-85ee47a18dbd/recruiting-ledger-filter-comparison.png`
- Viewport: 2360 × 1386 CSS px
- Source pixels: 2360 × 1386
- Implementation pixels: 2360 × 1386
- Density normalization: both captures compared at 1:1 pixel dimensions; no resampling was needed for the full-view comparison.
- State: candidate-detail ledger, default empty filters. A separate selected-state capture verifies two departments and two AI ratings selected simultaneously.

## Full-view comparison evidence

The implementation preserves the existing application shell and ledger table while keeping the search plus four highlighted filters on the first row and the date/sort controls on the second row. The source omits the persistent application sidebar while the current product shell includes it; this is an existing product constraint rather than drift introduced by the filter change.

## Focused comparison evidence

The focused comparison confirms the same filter order, one-line field height, border/radius treatment, neutral palette, dropdown affordance, and second-row date/sort grouping. The job filter remains wider than the other dimensions, matching the source hierarchy. The implementation uses the product's existing searchable combobox primitive so multi-selection remains accessible and consistent with other studio screens.

## Required fidelity surfaces

- Fonts and typography: existing product font family, weights, sizes, line heights, and muted placeholder hierarchy are unchanged and consistent with the source.
- Spacing and layout rhythm: the first-row filter sequence and second-row date/sort grouping match the source; responsive wrapping remains available at narrower viewports.
- Colors and visual tokens: existing field, border, foreground, muted, focus, and selection tokens are reused without introducing custom colors.
- Image quality and assets: this control change adds no raster, logo, illustration, or non-standard icon assets; existing product icons remain unchanged.
- Copy and content: empty labels remain `全部部门`, `全部岗位`, `全部 HR`, and `全部 AI 评价`; selected states show the single selected label or a compact selected-count summary.

## Interaction and runtime checks

- Selecting `技术部` kept the dropdown open; selecting `产品部` appended it and produced `已选 2 个部门`.
- Selecting `推荐` and `非常推荐` retained both department selections and produced `已选 2 个评价`.
- The URL contained both arrays simultaneously, so refresh/back-forward state is preserved.
- The ledger API returned HTTP 200 for the resulting filter requests.
- The local Vite server was cleanly restarted after a transient hot-module cache error. The reloaded page rendered normally, and no new browser console warnings or errors were observed after restart.

## Comparison history

1. Initial comparison: P2 — compact multi-select widths allowed the date filters to remain on the first row at the reference viewport, unlike the source.
2. Fix: split the search/multi-select controls and date/sort controls into two explicit responsive rows.
3. Post-fix evidence: the final full-view and focused comparison images show the intended two-row hierarchy with no remaining actionable P0/P1/P2 differences.

## Findings

No actionable P0, P1, or P2 findings remain. The application sidebar and narrower content frame are expected characteristics of the current product shell and are outside the highlighted filter-control change.

final result: passed

---

# Job recruiting status extension design QA

- Surface: `/w/default/studio/job-descriptions` and `/w/default/studio/recruiting-ledger`
- Runtime viewport: Codex in-app browser, responsive desktop layout
- State checked: default recruiting ledger filters and expanded job-status multi-select

## Verified

- The new `全部岗位状态` control uses the same searchable multi-select primitive, height, radius, typography, focus behavior, and spacing as the existing department, job, HR, and AI rating filters.
- At the available content width, controls wrap into two balanced rows without horizontal clipping: search/department/job first, then job status/HR/AI rating.
- The expanded control exposes the intended three options: `招聘中`, `已暂停`, and `已停止`.
- Existing ledger content remains readable and the new filter does not introduce a new visual token or asset.
- Migration `20260921095329_bent_nehzno` was applied to the configured development database; the job settings list renders its status badges normally.
- `高级运维` was paused and then immediately restored. The badge changed to `已暂停`, its candidate-creation actions became disabled, and the final badge returned to `招聘中`.
- Attempting to stop `高级运维` reported that 9 candidates remain in the recruiting flow and kept `确认停止` disabled.
- The ledger returned 1,800 records for `招聘中` jobs versus 1,831 records without a status filter.
- Selecting `招聘中` and `已暂停` together produced `已选 2 个状态` and persisted both values in the URL. Clearing the filter restored the unfiltered ledger.

## Runtime fix found during QA

- The first live status-filter request exposed the existing 50-ID validation limit after resolving all 79 active jobs. The ledger now passes system-resolved job IDs through a dedicated internal scope, while the user-selection limit remains unchanged.
- The corrected status-filter request returned successfully and the page rendered without the previous server error.

final result: passed
