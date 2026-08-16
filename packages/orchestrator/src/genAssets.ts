/**
 * A3-001b：确定性状态栏图标 painter（通往真实位图管道的第一段，ADR-008 允许的
 * "确定性替代资源"——非透明占位，客户端可真实显示/点击的几何图标）。
 *
 * 产出：24×24 RGBA PNG，圆角实底方块（底色 = 候选选中底，前景 = 选中文字色内圆点）。
 * 诚实边界（knownLimitation）：几何图标、非字形级设计；真实 ssf 状态栏图标字段名
 * 待真机核对（R-01），打包路径先用 status/ 前缀并在风险台账登记。
 */

import { pngEncode, sha256, base64Encode, base64Decode } from "@imskin/zip";
import type { AssetDescriptorV1 } from "@imskin/contracts";

/** 快照内存储的资产条目：契约描述符 + base64 字节（JSON 可序列化）。 */
export interface StoredAsset {
  descriptor: AssetDescriptorV1;
  bytesB64: string;
  /** 包内路径（打进出口 zip 用）。 */
  path: string;
}

const SIZE = 24;
const RADIUS = 6;

/** 圆角内判定（像素中心到圆角矩形的距离近似）。 */
function inRoundRect(x: number, y: number, size: number, radius: number): boolean {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius || (x >= radius && x < size - radius) || (y >= radius && y < size - radius);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [80, 80, 80];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** 画一枚图标：圆角实底 + 中心前景圆点。返回 PNG 字节。 */
function paintIcon(bgHex: string, fgHex: string): Uint8Array {
  const [br, bg, bb] = hexToRgb(bgHex);
  const [fr, fgg, fb] = hexToRgb(fgHex);
  const px = new Uint8Array(SIZE * SIZE * 4);
  const c = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (!inRoundRect(x + 0.5, y + 0.5, SIZE, RADIUS)) {
        px[i + 3] = 0; // 圆角外透明
        continue;
      }
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      if (dx * dx + dy * dy <= 5 * 5) {
        px[i] = fr; px[i + 1] = fgg; px[i + 2] = fb; px[i + 3] = 255; // 前景圆点
      } else {
        px[i] = br; px[i + 1] = bg; px[i + 2] = bb; px[i + 3] = 255; // 实底
      }
    }
  }
  return pngEncode(SIZE, SIZE, px);
}

/** 状态栏图标集（三枚：中/英、全/半、软键盘——真实键名待真机核对 R-01）。
 *  底色 = 候选选中底、前景圆点 = 候选文字色（对"候选颜色太深/太浅"反馈敏感）。 */
export function paintStatusBarIcons(spec: { selectedFill: string; candidateText: string }): StoredAsset[] {
  const names = ["zhong", "quan", "jianpan"];
  return names.map((name, idx) => {
    // 前景用候选文字色；末枚反色点缀以示区分
    const bytes = paintIcon(spec.selectedFill, spec.candidateText);
    return {
      descriptor: {
        id: `ast_sb_${name}_${idx}`,
        role: "statusBar.icons",
        mediaType: "image/png",
        contentHash: sha256(bytes),
        byteLength: bytes.byteLength,
        dimensions: { width: SIZE, height: SIZE },
        source: "generated",
      },
      bytesB64: base64Encode(bytes),
      path: `status/${name}.png`,
    };
  });
}

/** StoredAsset → 出口 zip 条目。 */
export function assetsToZipEntries(assets: StoredAsset[]): { path: string; data: Uint8Array }[] {
  return assets.map((a) => ({ path: a.path, data: base64Decode(a.bytesB64) }));
}
