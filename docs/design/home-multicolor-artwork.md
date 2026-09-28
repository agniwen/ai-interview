# 首页多彩插画

使用内置 imagegen 编辑原图；保留人物、建筑、构图、纸张纹理与水彩线稿画风。

亮色使用蓝、紫、珊瑚粉及少量杏金色笔触。暗色采用第二版低饱和度、低亮度笔触，保留夜景及人物层次。原素材保留，新图存放在 multicolor 目录。首屏使用新插画，停用会覆盖新图的旧绿色视频。

## 交付资源

- 原图编码版：`apps/web/public/landing/multicolor/`，10 张场景 JPG、2 张保留透明通道的笔触 PNG。
- 网页优化版：`apps/web/public/landing/optimized/multicolor/`，场景完整尺寸 AVIF/WebP，以及首屏 1280px、功能场景 1024px AVIF。
- 实际生成尺寸：城市和功能场景 1672×941；流程场景 1343×1171；透明笔触 2170×725。提示词请求的 4K 未作为实际交付尺寸，不进行放大。
- 使用 `bun run --filter @app/web images:home` 重新生成优化格式。
- 已通过 Web 类型检查、主题 CSS/背景层/流程组件共 4 项测试，并检查浏览器亮暗模式与图片加载。

## 最终提示词

### 首屏与登录页颗粒版（当前使用）

以同系列简历评审、团队校准插画作为风格参照，保留水彩、铅笔线条和纸纹；仅整理局部模糊细节，再添加细腻纸张颗粒。废弃偏建筑效果图的尝试。

当前资源：`multicolor/talent-city-grain-light.jpg`、`multicolor/talent-city-grain-dark.jpg`，以及 `optimized/multicolor/` 下对应完整尺寸 AVIF/WebP。实际尺寸 1672×941，首屏不再选用 1280px 缩小版本，优化质量提高至 90。

亮色最后一步提示词：

Precise finishing edit of this existing watercolor city illustration. Preserve its exact composition, architectural forms, people, watercolor brushwork, graphite sketch lines, blue lavender coral apricot painted ribbon and ivory daylight colors. Only adjust surface texture: add a subtle, fine, evenly distributed matte paper grain and delicate pigment granulation like high-quality watercolor on lightly textured cotton paper, especially visible in sky and color washes. Small natural irregular grains, gentle tactile printed editorial illustration quality. Reduce any coarse worm-like embossed/crackle texture into finer paper fibers; no chunky noise, no muddy smears, no heavy speckles, no blur, no glossy digital rendering, no new objects. Detail remains legible. Landscape same framing, highest available native resolution, no text or watermark.

暗色最后一步提示词：

Precise surface-texture finishing edit of this painted night city illustration. Keep exact composition, buildings, people, graphite lines, organic watercolor/dry-brush style and painted winding multicolor ribbon. Add restrained fine matte paper grain and tiny pigment granulation, replace the coarse embossed worm-like surface with finer natural cotton-paper fibers. Texture should be subtly visible in dark sky and washes but never noisy, dirty or blurred. Preserve legible local drawing. Keep very low-saturation gray-blue, dusty lavender and old rose with tiny muted ochre; reduce ribbon brightness gently to match subdued night illustration collection. Deep navy night and dim warm windows, no neon. No architectural photoreal render, no smooth vector/3D finish, no text/logo/UI. Same wide framing, highest available native resolution.

### hero

Use case: precise-object-edit. Asset type: production homepage hero background, wide 16:9. Edit target: the supplied city illustration. Preserve the same open urban plaza, pedestrian positions, architecture, perspective, broad empty ivory central sky for heading, hand-painted watercolor/gouache and graphite architectural drawing, paper grain, understated editorial illustration. Change the green smoke-like sweeping painted ribbon and green decorative washes into a harmonious MULTICOLOR watercolor ribbon: cobalt blue into soft violet, coral pink and small golden apricot passages, varied pigments with feathered edges and visible dry brush. It must feel like flowing creative energy linking people across the city, not a neon rainbow, not photographic smoke. Keep natural plant greens; replace only decorative brand-green painted strokes, retaining their spatial path. Match original light exposure and generous quiet center, no text, logo, UI, watermark. High detail, 3840x2160 landscape requested.

### evidence

Use case: precise-object-edit. Asset type: homepage editorial illustration. Input image: edit target. Preserve two professionals carefully reviewing a resume at a desk in an airy office, preserve left foreground people and open right architecture. Retain original hand-painted watercolor/gouache with architectural pencil linework, subtle paper grain, soft bright ivory background and landscape framing. Change only decorative green smoke-like ribbons, green painted brush swooshes and brand-green washes into flowing MULTICOLOR pigments: cobalt blue, lavender violet, coral pink, and restrained golden apricot, blending naturally in the same existing paths. Keep natural plant greens and natural skin colors. Same storytelling, lighting, detail, composition and painting style. Airy and refined, pigments translucent with dry-brush texture; no neon, no rainbow stripes, no new objects, no text, no UI, no watermark. Produce a single finished landscape illustration, 16:9.

### conversation

Use case: precise-object-edit. Asset type: homepage editorial illustration. Input image: edit target. Preserve two professionals talking across an interview table, preserve faces, hands, clothing, left-weighted composition and open right paper space. Retain original hand-painted watercolor/gouache with architectural pencil linework, subtle paper grain, soft bright ivory background and landscape framing. Change only decorative green smoke-like ribbons, green painted brush swooshes and brand-green washes into flowing MULTICOLOR pigments: cobalt blue, lavender violet, coral pink, and restrained golden apricot, blending naturally in the same existing paths. Keep natural plant greens and natural skin colors. Same storytelling, lighting, detail, composition and painting style. Airy and refined, pigments translucent with dry-brush texture; no neon, no rainbow stripes, no new objects, no text, no UI, no watermark. Produce a single finished landscape illustration, 16:9.

### team

Use case: precise-object-edit. Asset type: homepage editorial illustration. Input image: edit target. Preserve three colleagues reviewing documents together, preserve their identities, body positions, table and workplace. Retain original hand-painted watercolor/gouache with architectural pencil linework, subtle paper grain, soft bright ivory background and landscape framing. Change only decorative green smoke-like ribbons, green painted brush swooshes and brand-green washes into flowing MULTICOLOR pigments: cobalt blue, lavender violet, coral pink, and restrained golden apricot, blending naturally in the same existing paths. Keep natural plant greens and natural skin colors. Same storytelling, lighting, detail, composition and painting style. Airy and refined, pigments translucent with dry-brush texture; no neon, no rainbow stripes, no new objects, no text, no UI, no watermark. Produce a single finished landscape illustration, 16:9.

### workflow

Use case: precise-object-edit. Input: edit target. Production homepage illustration. Preserve this exact near-square daylight composition, people at left and right edges, large empty center and a winding painted path on plaza ground, original storytelling, people, buildings, composition, painterly watercolor/gouache and graphite linework, paper texture. Edit only decorative brand-green smoke-like ribbons and painted sweeping green path into naturally blended MULTICOLOR watercolor pigments: cobalt blue, lavender violet, coral pink, small golden apricot passages. Keep natural plants and skin. Keep bright ivory paper and airy daylight, quiet center for UI. Retain the existing sweep of brushwork. No extra subjects, no text, no logo, no UI. Single finished image, maintain original aspect ratio.

### heroDarkMuted

Use case: precise-object-edit. Input is the edit target, a DARK MODE homepage illustration. Keep exact original composition, all people, architecture, faces, poses, pencil linework, watercolor/gouache paper texture, aspect ratio, deep navy night atmosphere and warm window light. ONLY recolor the decorative green painted smoke/ribbon/path: use VERY MUTED MULTICOLOR slate-blue, dusty gray-violet, faint old-rose, and tiny desaturated ochre accents. CRITICAL client correction: earlier versions were much too vivid and bright. These pigments must have roughly the SAME LOW luminance and low contrast against navy as the ORIGINAL green strokes, saturation very low; softly integrated like an old pigment wash at night. Do not brighten the whole image or ribbon. Do not use vivid cobalt, candy pink, bright orange, neon, glow, luminous rainbow, high contrast, white strokes. Maintain a calm dark area for white UI text. Keep natural plants and skin unchanged. Single finished illustration. No added text or logos.

### evidenceDarkMuted

Use case: precise-object-edit. Input is the edit target, a DARK MODE homepage illustration. Keep exact original composition, all people, architecture, faces, poses, pencil linework, watercolor/gouache paper texture, aspect ratio, deep navy night atmosphere and warm window light. ONLY recolor the decorative green painted smoke/ribbon/path: use VERY MUTED MULTICOLOR slate-blue, dusty gray-violet, faint old-rose, and tiny desaturated ochre accents. CRITICAL client correction: earlier versions were much too vivid and bright. These pigments must have roughly the SAME LOW luminance and low contrast against navy as the ORIGINAL green strokes, saturation very low; softly integrated like an old pigment wash at night. Do not brighten the whole image or ribbon. Do not use vivid cobalt, candy pink, bright orange, neon, glow, luminous rainbow, high contrast, white strokes. Maintain a calm dark area for white UI text. Keep natural plants and skin unchanged. Single finished illustration. No added text or logos.

### conversationDarkMuted

Use case: precise-object-edit. Input is the edit target, a DARK MODE homepage illustration. Keep exact original composition, all people, architecture, faces, poses, pencil linework, watercolor/gouache paper texture, aspect ratio, deep navy night atmosphere and warm window light. ONLY recolor the decorative green painted smoke/ribbon/path: use VERY MUTED MULTICOLOR slate-blue, dusty gray-violet, faint old-rose, and tiny desaturated ochre accents. CRITICAL client correction: earlier versions were much too vivid and bright. These pigments must have roughly the SAME LOW luminance and low contrast against navy as the ORIGINAL green strokes, saturation very low; softly integrated like an old pigment wash at night. Do not brighten the whole image or ribbon. Do not use vivid cobalt, candy pink, bright orange, neon, glow, luminous rainbow, high contrast, white strokes. Maintain a calm dark area for white UI text. Keep natural plants and skin unchanged. Single finished illustration. No added text or logos.

### teamDarkMuted

Use case: precise-object-edit. Input is the edit target, a DARK MODE homepage illustration. Keep exact original composition, all people, architecture, faces, poses, pencil linework, watercolor/gouache paper texture, aspect ratio, deep navy night atmosphere and warm window light. ONLY recolor the decorative green painted smoke/ribbon/path: use VERY MUTED MULTICOLOR slate-blue, dusty gray-violet, faint old-rose, and tiny desaturated ochre accents. CRITICAL client correction: earlier versions were much too vivid and bright. These pigments must have roughly the SAME LOW luminance and low contrast against navy as the ORIGINAL green strokes, saturation very low; softly integrated like an old pigment wash at night. Do not brighten the whole image or ribbon. Do not use vivid cobalt, candy pink, bright orange, neon, glow, luminous rainbow, high contrast, white strokes. Maintain a calm dark area for white UI text. Keep natural plants and skin unchanged. Single finished illustration. No added text or logos.

### workflowDarkMuted

Use case: precise-object-edit. Input is the edit target, a DARK MODE homepage illustration. Keep exact original composition, all people, architecture, faces, poses, pencil linework, watercolor/gouache paper texture, aspect ratio, deep navy night atmosphere and warm window light. ONLY recolor the decorative green painted smoke/ribbon/path: use VERY MUTED MULTICOLOR slate-blue, dusty gray-violet, faint old-rose, and tiny desaturated ochre accents. CRITICAL client correction: earlier versions were much too vivid and bright. These pigments must have roughly the SAME LOW luminance and low contrast against navy as the ORIGINAL green strokes, saturation very low; softly integrated like an old pigment wash at night. Do not brighten the whole image or ribbon. Do not use vivid cobalt, candy pink, bright orange, neon, glow, luminous rainbow, high contrast, white strokes. Maintain a calm dark area for white UI text. Keep natural plants and skin unchanged. Single finished illustration. No added text or logos.

### sweep

Use case: precise-object-edit. Edit target: transparent watercolor brush stroke. Preserve exact shape, taper, rough dry-brush edges, horizontal framing, empty alpha background, transparent holes and texture. Recolor sage green to softly blended MULTICOLOR dusty cobalt, gray lavender, subtle rose and tiny apricot. Restrained low saturation editorial watercolor pigment, no bright neon or rainbow stripes. Keep existing transparency, no paper or solid background, no shadow or text. A single isolated brush stroke for a website, genuinely transparent background. These same subtle pigments must work on light and dark surfaces.

### broad

Use case: precise-object-edit. Edit target: transparent watercolor brush stroke. Preserve exact shape, taper, rough dry-brush edges, horizontal framing, empty alpha background, transparent holes and texture. Recolor sage green to softly blended MULTICOLOR dusty cobalt, gray lavender, subtle rose and tiny apricot. Restrained low saturation editorial watercolor pigment, no bright neon or rainbow stripes. Keep existing transparency, no paper or solid background, no shadow or text. A single isolated brush stroke for a website, genuinely transparent background. These same subtle pigments must work on light and dark surfaces.
