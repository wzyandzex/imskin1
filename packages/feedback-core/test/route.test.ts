import { test } from "node:test";
import assert from "node:assert/strict";

import { routeFeedback } from "../src/route.ts";

test("路由表：五类反馈 rerunFrom 逐项正确", () => {
  assert.equal(routeFeedback("asset_param").rerunFrom, "A3");
  assert.equal(routeFeedback("layout").rerunFrom, "A2");
  assert.equal(routeFeedback("style").rerunFrom, "A1");
  assert.equal(routeFeedback("platform").rerunFrom, "A3-platform");
  assert.equal(routeFeedback("interaction").rerunFrom, "interaction");
});

test("每类都给出非空 scope 说明", () => {
  for (const t of ["asset_param", "layout", "style", "platform", "interaction"] as const) {
    const r = routeFeedback(t);
    assert.ok(r.scope.length > 0, `${t} 缺少 scope`);
  }
  // style 类保留正向反馈元素的语义应体现在 scope
  assert.match(routeFeedback("style").scope, /保留/);
});

test("platform：hints 写明具体平台进入 scope", () => {
  assert.match(routeFeedback("platform", ["百度"]).scope, /百度/);
  assert.match(routeFeedback("platform", ["搜狗"]).scope, /搜狗/);
  assert.match(routeFeedback("platform", ["百度", "搜狗"]).scope, /百度\/搜狗/);
  // 不传 hints 时给通用平台描述，仍指明"另一平台不受影响"
  assert.match(routeFeedback("platform").scope, /另一平台不受影响/);
});
