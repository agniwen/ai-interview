// 天空背景首帧图所在的 COS 源；图片地址见 globals.css 的 .sky-backdrop-poster。
// COS origin for the sky backdrop posters; image URLs live in globals.css (.sky-backdrop-poster).
export const SKY_POSTER_ORIGIN = "https://ai-interview-1350977987.cos.ap-guangzhou.myqcloud.com";

/** 用到天空背景的路由在 head 里提前建连，首帧图更早开始下载。 Warm the connection on sky routes. */
export const skyPosterPreconnectLink = { href: SKY_POSTER_ORIGIN, rel: "preconnect" } as const;
