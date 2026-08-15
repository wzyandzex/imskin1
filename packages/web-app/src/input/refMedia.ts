/**
 * 参考素材采集（FR-INPUT-1）—— 浏览器内零依赖处理图片与视频。
 *
 * - 图片：canvas 降采样（最长边 768px，JPEG dataURL），控制多模态 token 成本（AC2）。
 * - 视频：<video> + canvas 均匀采样候选帧，用颜色直方图差分选出场景变化最大的 ≤3 关键帧（AC3）。
 *   边界：动效意向（如"输入时粒子效果"）→ 行为性需求路由暂未实现，关键帧仅作静态视觉特征来源。
 * - 主色提取：像素量化取主色/点缀色/背景色 —— LLM 不可用时的确定性降级来源（诚实降级，
 *   由调用方把对应字段标注进 inferredFields）。
 */

/** 一份已处理的参考素材（图片或视频关键帧集合）。 */
export interface RefMedia {
  kind: "image" | "video";
  /** 原文件名（chip 展示用）。 */
  name: string;
  /** 处理后的帧（图片 1 帧；视频 ≤3 关键帧），JPEG dataURL。 */
  frames: string[];
}

const MAX_EDGE = 768;
const JPEG_QUALITY = 0.85;
const MAX_KEYFRAMES = 3;
const VIDEO_SAMPLES = 12;

/** 把图像源画到降采样 canvas，返回 canvas 与 2d 上下文。 */
function drawScaled(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 图片文件 → 降采样 JPEG dataURL。 */
export async function processImageFile(file: File): Promise<RefMedia> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`无法读取图片 ${file.name}`));
      el.src = url;
    });
    const canvas = drawScaled(img, img.naturalWidth, img.naturalHeight);
    return { kind: "image", name: file.name, frames: [canvas.toDataURL("image/jpeg", JPEG_QUALITY)] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 4x4x4 颜色直方图（64 桶，归一化），用于帧间差分。 */
function histogram(data: Uint8ClampedArray): Float32Array {
  const bins = new Float32Array(64);
  const px = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] >> 6, g = data[i + 1] >> 6, b = data[i + 2] >> 6;
    bins[(r << 4) | (g << 2) | b] += 1;
  }
  for (let i = 0; i < 64; i++) bins[i] /= px;
  return bins;
}

function histDiff(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < 64; i++) d += Math.abs(a[i] - b[i]);
  return d;
}

/**
 * 视频文件 → 关键帧（≤3）。策略：均匀采样 VIDEO_SAMPLES 帧，
 * 首帧必选；其余按与已选帧的最小直方图差分贪心选最"不一样"的（场景/色彩变化点）。
 */
export async function processVideoFile(file: File): Promise<RefMedia> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(`无法读取视频 ${file.name}`));
      video.src = url;
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`视频 ${file.name} 时长无效`);

    const samples: Array<{ dataUrl: string; hist: Float32Array }> = [];
    const n = Math.min(VIDEO_SAMPLES, Math.max(2, Math.ceil(duration)));
    for (let i = 0; i < n; i++) {
      const t = (duration * (i + 0.5)) / n;
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("视频解码失败"));
        video.currentTime = t;
      });
      const canvas = drawScaled(video, video.videoWidth, video.videoHeight);
      const ctx = canvas.getContext("2d")!;
      samples.push({
        dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
        hist: histogram(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
      });
    }

    // 贪心选关键帧：首帧必选，然后每次选与已选集合最小差分最大的帧。
    const picked = [0];
    while (picked.length < Math.min(MAX_KEYFRAMES, samples.length)) {
      let best = -1, bestScore = -1;
      for (let i = 0; i < samples.length; i++) {
        if (picked.includes(i)) continue;
        const score = Math.min(...picked.map((p) => histDiff(samples[i].hist, samples[p].hist)));
        if (score > bestScore) { bestScore = score; best = i; }
      }
      // 差分过小说明画面几乎不变，不再多选（避免重复帧浪费 token）
      if (best === -1 || bestScore < 0.08) break;
      picked.push(best);
    }
    picked.sort((a, b) => a - b);
    return { kind: "video", name: file.name, frames: picked.map((i) => samples[i].dataUrl) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 按 MIME 分流处理一个参考素材文件；不支持的类型抛错（调用方提示用户）。 */
export async function processRefFile(file: File): Promise<RefMedia> {
  if (file.type.startsWith("image/")) return processImageFile(file);
  if (file.type.startsWith("video/")) return processVideoFile(file);
  throw new Error(`不支持的文件类型：${file.name}（仅支持图片与视频）`);
}

/** 提取出的确定性视觉特征（LLM 降级时合并进 brief）。 */
export interface ExtractedColors {
  /** 主导色（饱和度加权最高频）。 */
  primary: string;
  /** 点缀色（与主色色相差异最大的次频色，可能缺省）。 */
  accent?: string;
  /** 背景色（边缘像素主导色）。 */
  background?: string;
}

function toHex(r: number, g: number, b: number): string {
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * 从 dataURL 图像确定性提取主色/点缀色/背景色（量化到 4bit/通道计数）。
 * 供无 LLM / LLM 失败时的降级链使用（FR-INPUT-1 AC2 的保底实现）。
 */
export async function extractColors(dataUrl: string): Promise<ExtractedColors> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("无法解码图像"));
    el.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  const side = 64; // 主色提取不需要高分辨率
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, side, side);
  const data = ctx.getImageData(0, 0, side, side).data;

  // 量化计数：整体 + 边缘（背景取边缘）
  const all = new Map<number, { n: number; r: number; g: number; b: number }>();
  const edge = new Map<number, { n: number; r: number; g: number; b: number }>();
  const bump = (m: typeof all, key: number, r: number, g: number, b: number) => {
    const e = m.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    m.set(key, e);
  };
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      bump(all, key, r, g, b);
      if (x < 4 || x >= side - 4 || y < 4 || y >= side - 4) bump(edge, key, r, g, b);
    }
  }
  const avg = (e: { n: number; r: number; g: number; b: number }) =>
    [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)] as const;
  const sat = ([r, g, b]: readonly [number, number, number]) => Math.max(r, g, b) - Math.min(r, g, b);

  // 主色：频次 ×（1+饱和度权重），避免灰白背景压过真正的主导色
  const ranked = [...all.values()].map((e) => ({ e, rgb: avg(e) }))
    .sort((a, b) => b.e.n * (1 + sat(b.rgb) / 128) - a.e.n * (1 + sat(a.rgb) / 128));
  const primaryRgb = ranked[0].rgb;

  // 点缀色：前 8 频色中与主色欧氏距离最大且足够远的
  let accent: string | undefined;
  let maxDist = 0;
  for (const { rgb } of ranked.slice(1, 8)) {
    const d = Math.hypot(rgb[0] - primaryRgb[0], rgb[1] - primaryRgb[1], rgb[2] - primaryRgb[2]);
    if (d > maxDist) { maxDist = d; accent = toHex(...rgb); }
  }
  if (maxDist < 60) accent = undefined; // 距离太近不算点缀色

  const edgeRanked = [...edge.values()].sort((a, b) => b.n - a.n);
  const background = edgeRanked.length > 0 ? toHex(...avg(edgeRanked[0])) : undefined;

  return { primary: toHex(...primaryRgb), accent, background };
}
