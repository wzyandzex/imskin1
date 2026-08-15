/**
 * 解析结果统一形态（docs/01 §17：公共契约带运行时 parser，不做裸类型断言）。
 * ok=false 时 issues 给出可直接展示的问题描述，不抛异常。
 */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };
