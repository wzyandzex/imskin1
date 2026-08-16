/**
 * 深拷贝工具（DOM-002 深层不可变）。
 *
 * 版本快照/fork/合并必须切断嵌套引用共享——否则子版本修改会污染父版本与历史
 * （docs/01 §16 不可变性）。data 域是纯 JSON 数据（brief/spec/skin/qa/provenance），
 * structuredClone 足够；环境缺失时回退 JSON 往返（慢但语义等价）。
 */

export function deepCopy<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      /* 含不可克隆值（不应出现在 data 域）→ 回退 JSON */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
