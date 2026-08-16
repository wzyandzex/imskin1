/**
 * A3 图像生成接入（文生图/图生图）—— 让皮肤有真实位图切图。
 *
 * 设计：OpenAI Images API 兼容（`/images/generations`，DALL·E / 各家兼容服务 /
 * 本地 SD WebUI / ComfyUI 兼容端点），`base_url + api_key + model` 三元组。
 * 返回 base64 或 URL（URL 则再拉取字节）。失败回退：不产假图，返回 fellBack=true，
 * 由调用方决定用占位/纯色（诚实边界：结构正确的配置骨架已在，位图是增强而非造假）。
 */

import type { LLMProviderConfig } from "./types.ts";
import { LLMError } from "./types.ts";
import { assertSafeBaseUrl } from "./urlGuard.ts";

export interface ImageGenRequest {
  /** 文生图提示词。 */
  prompt: string;
  /** 尺寸，如 "1024x1024"。 */
  size?: string;
  /** 张数（默认 1）。 */
  n?: number;
  /** 额外参数（各后端差异，如 negative_prompt / steps）。 */
  extra?: Record<string, unknown>;
}

export interface GeneratedImage {
  /** PNG 字节。 */
  bytes: Uint8Array;
  /** 来源（b64/url）。 */
  source: "b64" | "url";
}

interface ImagesResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
}

const DEFAULT_TIMEOUT = 120_000; // 图像生成较慢

/** 文生图（OpenAI Images 兼容）。失败抛 LLMError（调用方决定降级）。 */
export async function generateImage(cfg: LLMProviderConfig, req: ImageGenRequest): Promise<GeneratedImage> {
  assertSafeBaseUrl(cfg.baseUrl); // SEC-002：生成请求前拦截
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(cfg.headers ?? {}) };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: cfg.model, prompt: req.prompt, n: req.n ?? 1, size: req.size ?? "1024x1024", ...(req.extra ?? {}) }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: ImagesResponse = {};
    try {
      json = JSON.parse(text) as ImagesResponse;
    } catch {
      /* 非 JSON */
    }
    if (!res.ok) throw new LLMError(`图像生成失败: ${json.error?.message ?? `HTTP ${res.status}`}`, res.status === 429 || res.status >= 500);

    const item = json.data?.[0];
    if (item?.b64_json) {
      const bin = atob(item.b64_json);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, source: "b64" };
    }
    if (item?.url) {
      assertSafeBaseUrl(item.url); // SEC-002：模型返回的图片 URL 同样过边界检查
      const img = await fetch(item.url);
      if (!img.ok) throw new LLMError(`图像下载失败: HTTP ${img.status}`, true);
      return { bytes: new Uint8Array(await img.arrayBuffer()), source: "url" };
    }
    throw new LLMError("图像生成返回为空");
  } catch (e) {
    if (e instanceof LLMError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new LLMError("图像生成超时", true);
    throw new LLMError(`图像生成网络错误: ${e instanceof Error ? e.message : String(e)}`, true);
  } finally {
    clearTimeout(timer);
  }
}

/** 由皮肤设计意图构造文生图提示词（供 A3 键盘背景/切图）。 */
export function skinImagePrompt(opts: { styleKeywords: string[]; mood?: string; primary: string; material?: string }): string {
  const kw = opts.styleKeywords.join(", ");
  return [
    `A clean, high-quality app keyboard background texture, ${kw} style`,
    opts.mood ? `mood: ${opts.mood}` : "",
    `dominant color ${opts.primary}`,
    opts.material ? `material: ${opts.material}` : "",
    "flat design, smooth, no text, no letters, no watermark, suitable as UI background",
  ]
    .filter(Boolean)
    .join(", ");
}
