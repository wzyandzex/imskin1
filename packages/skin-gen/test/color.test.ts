import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseHex,
  toHex,
  contrastRatio,
  relativeLuminance,
  lighten,
  darken,
  isDark,
  readableTextOn,
} from "../src/color.ts";

test("parseHex 支持 #rgb 与 #rrggbb", () => {
  assert.deepEqual(parseHex("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHex("000000"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(parseHex("#4a90e2"), { r: 74, g: 144, b: 226 });
});

test("parseHex 拒绝非法值", () => {
  assert.throws(() => parseHex("#xyz"));
  assert.throws(() => parseHex("#12"));
});

test("toHex 往返一致", () => {
  assert.equal(toHex(parseHex("#4a90e2")), "#4a90e2");
});

test("对比度：黑白=21，同色=1", () => {
  assert.ok(Math.abs(contrastRatio("#000", "#fff") - 21) < 0.01);
  assert.ok(Math.abs(contrastRatio("#777", "#777") - 1) < 0.001);
});

test("相对亮度：白=1，黑=0", () => {
  assert.ok(Math.abs(relativeLuminance("#fff") - 1) < 0.001);
  assert.ok(relativeLuminance("#000") < 0.001);
});

test("lighten/darken 朝白/黑移动", () => {
  assert.ok(relativeLuminance(lighten("#4a90e2", 0.5)) > relativeLuminance("#4a90e2"));
  assert.ok(relativeLuminance(darken("#4a90e2", 0.5)) < relativeLuminance("#4a90e2"));
  assert.equal(lighten("#000000", 1), "#ffffff");
  assert.equal(darken("#ffffff", 1), "#000000");
});

test("isDark 判定", () => {
  assert.ok(isDark("#131319"));
  assert.ok(!isDark("#eef2f7"));
});

test("readableTextOn：深底选白、浅底选深，均达阈值", () => {
  const onDark = readableTextOn("#131319");
  assert.ok(contrastRatio("#131319", onDark.color) >= 4.5);
  const onLight = readableTextOn("#eef2f7");
  assert.ok(contrastRatio("#eef2f7", onLight.color) >= 4.5);
});

test("readableTextOn：候选都不达标时回退保证达标并标记 adjusted", () => {
  // 在中灰底上给两个都偏灰的候选，触发回退
  const res = readableTextOn("#808080", ["#8a8a8a", "#777777"], 4.5);
  assert.equal(res.adjusted, true);
  assert.ok(res.ratio >= 4.5);
});
