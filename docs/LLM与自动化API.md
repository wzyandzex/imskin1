# LLM 接入与自动化 API（模块 7 设计说明）

> 落地：[`packages/llm-core`](../packages/llm-core)（用户可接自己的模型）+ [`packages/api`](../packages/api)（REST/CLI 自动化接口）。
> 调研依据：LiteLLM / Vercel AI SDK / Replicate / fal.ai / MCP / Ollama / OpenAI structured outputs 的业界设计（见下文）。
>
> **⚠️ 2026-08-15 安全状态修正（ADR-005，对应风险 R-15）**：
> - **实现现状**：web-app 为**浏览器直连模式**——用户 API Key 经 `modelConfigs.ts` 持久化到 localStorage，并直接在浏览器向自定义 Base URL 发起请求。下文 §1 表格中"前端走 REST 代理"一句**与实现不符**，以本节为准。
> - **目标边界**（SEC-003 落地前为已知风险）：① Key 默认**仅本次会话**，不持久化；② 直连模式 UI 必须明示"Key 仅存本机、请求直发你所配置的服务，存在浏览器环境风险"；③ 项目文件导出**永不包含**模型配置与 Key；④ 中期走本地 API 代理（api 包扩展），服务端实施 SSRF 校验（协议/私网/metadata/重定向/下载大小与超时）。
> - **API 服务现状**：未配置 `--api-key` 时默认放行且 job 仅存内存（R-14）——**仅限本机 loopback 使用**；任何局域网/公网共享前必须完成 SEC-001。
> - 导出的四出口包当前为 **structural 实验级**（配置骨架为主），"字节非空"不代表可安装（见 `docs/02`）。

---

## 1. 用户接入自己的模型（LLM 接入层）

### 设计目标
让用户可以：
- 接入**自己的模型**（自己的 API key、自建 endpoint、本地模型如 Ollama）；
- 也可用**默认/确定性**路径（无 key / 离线时可用）；
- 像 ZCode / continue.dev / Aider 那样通过**配置**切换 provider，而非改代码。

### 业界最优实践（调研结论）

| 实践 | 来源 | 我们采用 |
|---|---|---|
| **OpenAI 兼容为通用语言**：`base_url + api_key + model` 三元组，任何兼容后端（OpenAI/DeepSeek/通义/Moonshot/OpenRouter/vLLM/Ollama/LM Studio）都可接入 | LiteLLM「regardless of provider,统一 OpenAI 格式」、Ollama `localhost:11434/v1` 兼容端点 | ✅ `LLMProviderConfig{baseUrl, apiKey, model}` |
| **Provider 注册表**：`providerId:modelId` 字符串寻址，多 provider 混合、别名、默认 provider | Vercel AI SDK `createProviderRegistry`（分隔符 `:`） | ✅ `LLMRegistry.register/resolve("ollama:qwen2.5")` |
| **结构化输出**：JSON schema 约束 LLM 返回可靠结构；strict json_schema 优先，不支持的后端回退 json_object + prompt 内嵌 schema | OpenAI structured outputs、Instructor | ✅ `callOpenAICompatible` 自动 strict→json_object 降级 |
| **降级链（fallback）**：LLM 失败/超时/返回非法 → 自动回退到确定性启发式，**不静默、记 provenance** | LiteLLM Router「built-in retry/fallback」 | ✅ `understandIntent` 返回 `fellBack` + `provenance.reason` |
| **密钥安全**：api key 由调用方注入（环境变量/配置）；前端不直连（CORS/key 泄露），需经后端代理 | LiteLLM 环境变量/YAML、Ollama「key 必填但被忽略」 | 🟡 `registryFromEnv` 读环境变量（CLI/服务端 ✅）；**web-app 当前为直连模式，目标改本地代理**（ADR-005，见文首修正） |
| **本地模型接入**：Ollama/LM Studio 本地 OpenAI 兼容 endpoint，无需 key | Ollama `http://localhost:11434/v1` | ✅ `registryFromEnv` 内置 ollama provider |

### 落地 API

```ts
import { LLMRegistry, registryFromEnv, understandIntent } from "@imskin/llm-core";

// 方式一：显式注册（用户接自己的模型）
const registry = new LLMRegistry()
  .register({ id: "deepseek", baseUrl: "https://api.deepseek.com/v1", apiKey: process.env.DEEPSEEK_API_KEY, model: "deepseek-chat" })
  .register({ id: "ollama", baseUrl: "http://localhost:11434/v1", apiKey: "ollama", model: "qwen2.5" })
  .setDefault("deepseek");

// 方式二：环境变量（IMSKIN_LLM_BASE_URL/IMSKIN_LLM_MODEL/IMSKIN_LLM_API_KEY，或 OPENAI_/DEEPSEEK_/OLLAMA_HOST）
const registry2 = registryFromEnv(process.env);

// 调用（LLM 增强的 A1 意图理解；失败自动降级确定性）
const r = await understandIntent("想要一个清冷极简、水墨留白的皮肤", registry);
// r.data = DesignBrief；r.fellBack = 是否走了确定性回退；r.provenance = provider/model/耗时/降级原因
```

**降级链**：无 provider / 网络错 / 超时 / 返回非法 JSON / 结构不合法 → 全部回退到 `skin-gen/analyzeIntent`（确定性），**不抛给调用方**，`provenance.fellBack=true` 标记。这保证"没配 key 也能用"，且前端/CLI 可如实展示"本次用了确定性回退"。

---

## 2. 自动化 API（让用户的工具调用我们的产品）

### 用户的诉求
写**自动化工具**调用产品能力：批量生成皮肤、嵌入 CI/CD、第三方集成、程序化调用 意图理解/生成/反馈/导出四出口。

### 业界形态对比（调研结论）与我们的选择

| 形态 | 代表 | 适用 | 我们 |
|---|---|---|---|
| **REST API（本地 server）** | Ollama（localhost:11434）、Replicate/fal.ai | 跨语言、自动化工具、第三方集成 | ✅ `packages/api` REST server（node:http 零依赖） |
| **CLI** | vercel/gh/supabase CLI | 脚本、CI/CD、批量 | ✅ `imskin generate/serve` |
| **编程 SDK** | OpenAI/Anthropic 官方 SDK | 同语言深度集成 | ✅ `AutomationService`（TS 直接 import） |
| **MCP** | Anthropic MCP | 让 AI agent 调用（Claude/Cursor） | 🔜 后续可加（把 REST 能力包成 MCP tools） |

> 因为引擎是**零依赖 TypeScript**、可跑在 Node，我们不需要云端后端——本地 server（Ollama 模式）+ CLI 即可覆盖自动化场景。

### 异步 job 模式（对齐 Replicate/fal.ai）

生成是耗时操作（LLM + 未来图像生成），用**异步任务**：
- `POST /v1/generations` 创建任务 → 返回 `{ id, status: "queued" }`；
- `GET /v1/generations/:id` 轮询状态（`queued/processing/succeeded/failed` + `progress`）；
- `?wait=1` 同步等待（Replicate `Prefer: wait` 思想），短任务直接给结果。

### REST 端点

```
POST /v1/generations            创建生成任务（body: { idea | brief, name?, llm? }）
GET  /v1/generations/:id        查询任务状态/结果
POST /v1/versions/:id/feedback  反馈迭代（body: { text }）
GET  /v1/versions/:id/export    导出生出口包（?outlet=sogouPc|sogouMobile|baiduPc|baiduMobile）
GET  /v1/versions               列版本
GET  /v1/health                 健康检查
```

**认证**：`Authorization: Bearer <key>`（对齐 Replicate）。启动时未配 key → 本机放行（Ollama 模式：本机工具默认信任）。

### CLI

```bash
# 生成并导出四出口到目录
node packages/api/src/cli.ts generate "国潮水墨风格，主色墨黑" --name 水墨 --out ./out

# 启动本地 REST server（供其他工具调用）
node packages/api/src/cli.ts serve --port 7317 --api-key $KEY
```

### 编程 SDK（TS）

```ts
import { AutomationService } from "@imskin/api";
import { registryFromEnv } from "@imskin/llm-core";

const svc = new AutomationService({ registry: registryFromEnv(process.env) });
const job = svc.generateSync({ idea: "国潮水墨，主色墨黑", name: "水墨" });
// ...轮询 job.status === "succeeded"
const set = svc.export(job.result.versionId); // { sogouPc, sogouMobile, baiduPc, baiduMobile } 字节
```

---

## 2.5 LLM 增强的三条链路（A1 / A5 / A3）

LLM 接入层不止 A1 意图理解，覆盖了智能体管线的三个语义环节，全部**确定性降级兜底**：

| 链路 | LLM 增强 | 降级 | 入口 |
|---|---|---|---|
| **A1 意图理解** | `understandIntent`：模糊想法 → DesignBrief（JSON schema 约束） | `skin-gen/analyzeIntent` 启发式 | 前端生成 / `AutomationService` |
| **A5 反馈迭代** | `understandFeedback`：口语化反馈（"感觉有点廉价"）→ 结构化 direction（"更稳重高级"），再走强确定性定向修改 | `feedback-core/classifyFeedback` 关键词 | `orchestrator.applyFeedbackSmart` |
| **A3 图像生成** | `generateImage`（OpenAI Images 兼容 `/images/generations`）：设计意图 → 键盘背景位图 PNG | 返回 null（不产假图），走纯色/渐变骨架 | `orchestrator.generateKeyboardBg` + `exportSkinSet({images})` |

**orchestrator 的 LLM 钩子**（不破坏零依赖——用结构化类型注入，非 import）：

```ts
orch.llm = {
  understandFeedback: async (text) => { /* ... */ },
  generateKeyboardBg: async (brief) => { /* ... */ },
};
await orch.applyFeedbackSmart(versionId, "感觉有点廉价"); // LLM 增强 → 确定性定向修改
const png = await orch.generateKeyboardBg(versionId);        // A3 位图（失败 null）
const set = orch.exportSkinSet(versionId, { images: [{ path: "bg.png", data: png }] });
```

前端在用户配置模型后自动注入这些钩子（A1 生成、A5 反馈、A3 图像都走用户的模型；未配置则全确定性）。

---

## 3. 测试与验证

- 测试统计**以命令输出为准**（统一统计脚本落地前不在文档手写固定数字；llm-core/api 测试全部以 `node:test` 的 `mock.method(fetch)` 离线验证，不证明真实 provider 质量）。
- CLI 实跑验证：`generate` 产出版本 + 导出四个结构包（.ssf/.bps/.bds 字节非空）——**结构验证 ≠ 可安装**（见 `docs/02`）。

## 4. 诚实边界

- LLM 结构化输出的**真实质量**取决于所接模型；本层只保证"接入 + 结构化 + 降级"，不保证某模型的审美判断。
- **安全边界现状**：Key 入 localStorage + 浏览器直连任意 Base URL + 未配 key 默认放行 + 内存 job——均为已登记风险（R-15/R-14），共享/对外部署前必须按 SEC-001..003 收口（ADR-005/006）。
- REST server 是**本地/自托管**形态；要做多租户云端服务需再加 配额/速率限制/对象存储，本期范围外。
- MCP server 形态预留（把 REST 能力包成 MCP tools），未实现。
