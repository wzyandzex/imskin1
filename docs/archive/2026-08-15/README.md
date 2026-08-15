# IMSkin — 输入法皮肤智能体系统

用一段想法（可带参考图/视频）自动生成可安装到**搜狗、百度两大输入法 PC 端与移动端（四个出口）**的皮肤，并在网页里**像真的打字一样**实时预览、多轮反馈迭代。

- 设计基线：[`架构设计.md`](./架构设计.md)
- 需求基线：[`需求规格说明书.md`](./需求规格说明书.md)
- **市场调研与产品启示：[`市场调研与产品启示.md`](./市场调研与产品启示.md)** ← 真实用户需求/痛点/现有产品空白/可借鉴理念（需求文档中 [调研] 条款的证据来源）
- **LLM 接入与自动化 API：[`docs/LLM与自动化API.md`](./docs/LLM与自动化API.md)** ← 用户可接自己的模型（OpenAI 兼容/Ollama）+ REST/CLI/SDK 自动化接口
- **项目状态与交付（Handoff）：[`项目状态与交付.md`](./项目状态与交付.md)** ← 当前进度、架构↔实现对照、受阻项与解封条件、M0 待办

## 工程结构（随真实模块生长，不铺空壳）

```
packages/
  pinyin-engine/   拼音输入内核（26 键 + 九宫格 T9）——预览引擎的"不能造假"基石
  skin-gen/        皮肤生成核心 + 皮肤契约（SkinManifest）：设计意图 → 视觉token → 皮肤，含可读性 QA
  project-model/   版本树与项目状态（分叉/血缘/元素级合并/满意标记）
  feedback-core/   A5 反馈解析：分类 → 路由 → 定向最小修改
  qa-core/         A6 发布前校验：可读性对比度、跨出口一致性
  zip/             零依赖 store-zip + CRC32 + MD5 + UTF-16LE + 字节工具（各适配器打容器共用）
  sogou-adapter/   搜狗 PC .ssf：skin.ini 生成器（UTF-16，字段经 ssfconv/真实样本逆向确证）+ 加密容器子路径
  sogou-mobile-adapter/  搜狗 Android .ssf：phoneTheme.ini + theme/<布局>/layout + res/resblack（真实 APK 逆向确证）
  baidu-pc-adapter/      百度 PC .bps：skin.ini/Skin.xml + Candidate/Status.xml 布局（真实皮肤解包逆向确证）
  baidu-mobile-adapter/  百度 Android .bds：Info.txt/Token.txt + port/land 布局 + css.ini（真实 APK 逆向确证）
  orchestrator/    编排层：A1..A6 串成 生成→反馈迭代→四出口导出（搜狗/百度 × PC/Android）主循环（含溯源）
  llm-core/        LLM 接入层：provider 注册表 + OpenAI 兼容默认 + 结构化输出 + 降级链（用户可接自己的模型/Ollama）
  api/             自动化 API：REST 本地 server（node:http 零依赖、Bearer 认证、异步 job）+ CLI + 编程 SDK
  web-app/         前端工作台 + 实时预览运行时（PC/手机 真实可交互虚拟键盘，皮肤驱动渲染）
```

测试：全项目 305 个测试全绿（222 node + 83 web-app 的 vitest 交互测试）。

> **iOS 边界**：百度/搜狗 iOS 输入法受系统扩展沙盒限制，无外部皮肤包导入通道，DIY 生成器无法覆盖 iOS，仅能产出设计稿供用户走 App 内 AI 皮肤。四出口 = 搜狗PC / 搜狗Android / 百度PC / 百度Android。

## 现状与构建顺序

按里程碑（详见需求文档 §9），M1 搜狗链路与 M2 预览引擎不依赖 M0 调研，可独立开工。**当前四出口（搜狗/百度 × PC/Android）适配层均已按逆向笔记落地**（字段经真实皮肤/APK 逆向确证），真实位图/切图与真机安装验证为本线剩余核心阻塞。

## 开发约定

- 引擎内核用 TypeScript 编写，依赖 **Node ≥ 22 的原生 TS 执行 + 原生测试运行器**，核心逻辑零第三方依赖即可跑测试。
- 运行引擎测试：`node --test packages/pinyin-engine/test/*.test.ts`
- 前端安装依赖需用本地缓存：`npm install --cache ./.npm-cache`
- 启动实时预览：`npm run dev -w @imskin/web-app`（默认 http://localhost:5173/）
- 预览交互测试：`npx vitest run --root packages/web-app`
- **自动化 API（CLI）**：`node packages/api/src/cli.ts generate "想法" --out ./out` 生成并导出四出口；`node packages/api/src/cli.ts serve --port 7317` 启动本地 REST server。LLM 接入见 [`docs/LLM与自动化API.md`](./docs/LLM与自动化API.md)（配 `IMSKIN_LLM_BASE_URL`/`IMSKIN_LLM_MODEL`/`IMSKIN_LLM_API_KEY` 或 Ollama）。
