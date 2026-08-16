/**
 * @imskin/llm-core —— LLM 接入层。
 *
 * - 契约：LLMProviderConfig / StructuredRequest / LLMResult（types.ts）。
 * - OpenAI 兼容调用：callOpenAICompatible（strict json_schema + json_object 降级）。
 * - 注册表：LLMRegistry / registryFromEnv（多 provider 混合、别名、默认）。
 * - A1 意图理解：understandIntent（LLM 增强 + 确定性降级链）。
 */

export type {
  LLMProviderConfig,
  ChatMessage,
  ContentPart,
  StructuredRequest,
  LLMResult,
} from "./types.ts";
export { LLMError } from "./types.ts";
export { callOpenAICompatible } from "./openai.ts";
export { assertSafeBaseUrl, isPrivateOrMetadataHost, isLoopbackHost } from "./urlGuard.ts";
export { LLMRegistry, registryFromEnv } from "./registry.ts";
export { understandIntent } from "./intent.ts";
export { understandFeedback, type FeedbackIntent } from "./feedback.ts";
export { generateImage, skinImagePrompt, type ImageGenRequest, type GeneratedImage } from "./image.ts";
export {
  capabilityForModel,
  defaultTier,
  tierById,
  type ReasoningTier,
  type ReasoningCapability,
} from "./reasoning.ts";
