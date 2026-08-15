# @imskin/baidu-mobile-adapter

百度移动皮肤**配置生成器**（架构 §2.5）。产出百度移动皮肤的三类文本配置：

- **布局** `emitLayout`：段 `[INPUT]/[CAND]/[PANEL]/[MORE]/[HINT]/[LIST]` + 按键块 `[KEY n]`（可见/触摸矩形、背景切片 id、逐键手势/动作 `CENTER/HOLD/HOLDSYM/UP/DOWN/LEFT/RIGHT`）。
- **切片 .til** `emitTil`：`[GLOBAL]`(USE_ALPHA/TILE_NUM) + 每片 `[IMG n]`(SOURCE_RECT)。
- **样式 STYLE** `emitStyles`：`[STYLE n]`(NM_IMG 常态 / HL_IMG 高亮)。

## 字段可信度

字段**经开源生成器 BGtool.c 逆向确证**（github.com/Gearkey/baidu_input_skins，一个真实生成可安装 `.bds` 皮肤布局的 C 程序）——**不是"逆向猜格式"**，字段来自能产出真机可用皮肤的工具源码。

## 诚实边界（见 `src/fields.ts` 文件头）

**仍待真机/官方样本核实**：颜色/尺寸取值编码、当前主流百度输入法版本接受的后缀（`.bdi`/`.bds` vs 有保护的 `.bps`）、`.bps` 是否强制、Land/Port/Res 目录结构（仅教程级）、是否需登录/联网校验、iOS/Android 差异、**真机安装验证**。未建模字段可经 `extraSections` 逃生舱承载。

**尚未接入**：`.bds` 打包（=zip，待与 sogou-adapter 共享 zip 层）、真实 png 素材（依赖 A3 图像生成）。

## 测试

```bash
node --test packages/baidu-mobile-adapter/test/*.test.ts
```

7 个测试覆盖布局/切片/样式生成、逐键手势、以及 INI 注入防御（从一开始内建净化，避免 sogou-adapter 曾栽的注入坑）。
