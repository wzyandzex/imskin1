/**
 * 溯源哈希（provenance）—— 给每个产出打一个由"输入"决定的确定性指纹，用于增量重跑的缓存判断
 * （架构 §3.2：产出带 provenance，相同输入 ⇒ 相同指纹 ⇒ 可命中缓存、跳过重算）。
 *
 * 用 FNV-1a 32-bit，纯函数、零依赖、确定性（不碰时间/随机）。这不是加密哈希，只需"输入变→指纹变"。
 */

/** 对任意可 JSON 序列化的值算稳定指纹。对象键先排序，保证与书写顺序无关。 */
export function provenance(input: unknown): string {
  return fnv1a(stableStringify(input));
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619，用位运算保持 32 位无符号
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** 稳定序列化：对象键按字典序排序，数组保序，从而与属性书写顺序无关。 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
