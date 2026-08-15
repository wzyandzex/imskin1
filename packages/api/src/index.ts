/**
 * @imskin/api —— 自动化 API。
 *
 * - AutomationService：与服务形态解耦的核心（生成/反馈/导出 + 异步 job）。
 * - REST：createApiServer / startApiServer（node:http 零依赖本地 server，Bearer 认证）。
 * - CLI：runCli（直接调引擎，供脚本/CI）。
 */

export { AutomationService, type GenerateJobInput, type Job, type JobStatus, type OutletKey } from "./service.ts";
export { createApiServer, startApiServer, type ServerOptions } from "./server.ts";
export { runCli } from "./cli.ts";
