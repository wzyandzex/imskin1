/**
 * REST API（本地 HTTP server，零依赖 node:http）—— 供用户的自动化工具调用。
 *
 * 端点（对齐 Replicate/fal.ai 的异步 job 模式）：
 *   POST   /v1/generations          创建生成任务（异步）→ { jobId } ；?wait=1 同步等待
 *   GET    /v1/generations/:id      查询任务状态/结果
 *   POST   /v1/versions/:id/feedback 反馈迭代
 *   GET    /v1/versions/:id/export  导出四出口包（?outlet=sogouPc|... 单出口；缺省打包信息）
 *   GET    /v1/versions             列版本
 *   GET    /v1/health               健康检查
 *
 * 认证：Bearer API key（`Authorization: Bearer <key>`）；服务启动时未配 key 则本地放行（本机工具）。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import type { AutomationService } from "./service.ts";

export interface ServerOptions {
  service: AutomationService;
  /** API key；不配则本地放行（Ollama 模式：本机工具默认信任）。 */
  apiKey?: string;
  port?: number;
  host?: string;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

/** body 上限：referenceImages 传 base64 图，20MB 足够多帧降采样图；超限 413，防止撑爆内存。 */
const MAX_BODY_BYTES = 20 * 1024 * 1024;

/** body 超限错误（路由层转 413）。 */
export class BodyTooLargeError extends Error {
  constructor() {
    super("request body too large");
    this.name = "BodyTooLargeError";
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function authed(req: IncomingMessage, apiKey?: string): boolean {
  if (!apiKey) return true; // 本机未配 key → 放行（startApiServer 已保证仅回环可达）
  const h = req.headers.authorization ?? "";
  // SEC-001：常量时间比较（先哈希等长，防时序侧信道逐字节泄露 key）
  const want = createHash("sha256").update(`Bearer ${apiKey}`, "utf8").digest();
  const got = createHash("sha256").update(h, "utf8").digest();
  return timingSafeEqual(want, got);
}

export function createApiServer(opts: ServerOptions): Server {
  const { service, apiKey } = opts;
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    try {
      if (!authed(req, apiKey)) return json(res, 401, { error: "unauthorized" });

      if (path === "/v1/health") return json(res, 200, { ok: true });

      if (path === "/v1/generations" && req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const wait = url.searchParams.get("wait") === "1";
        const job = wait ? service.generateSync(body) : service.generateAsync(body);
        // 同步等待：轮询到终态
        if (wait) {
          const deadline = Date.now() + 30_000;
          while (!["succeeded", "failed"].includes(job.status) && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 30));
          }
        }
        return json(res, job.status === "failed" ? 500 : 202, job);
      }

      const genMatch = path.match(/^\/v1\/generations\/([\w-]+)$/);
      if (genMatch && req.method === "GET") {
        const job = service.getJob(genMatch[1]);
        return job ? json(res, 200, job) : json(res, 404, { error: "job not found" });
      }

      const fbMatch = path.match(/^\/v1\/versions\/([\w-]+)\/feedback$/);
      if (fbMatch && req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const fb = service.feedback(fbMatch[1], String(body.text ?? ""));
        return json(res, 200, { versionId: fb.version.id, type: fb.classification.type, scope: fb.route.scope });
      }

      const expMatch = path.match(/^\/v1\/versions\/([\w-]+)\/export$/);
      if (expMatch && req.method === "GET") {
        const outlet = url.searchParams.get("outlet") as keyof ReturnType<AutomationService["export"]> | null;
        const set = service.export(expMatch[1]);
        if (outlet && set[outlet]) {
          res.writeHead(200, { "Content-Type": "application/octet-stream" });
          return res.end(Buffer.from(set[outlet]));
        }
        return json(res, 200, { outlets: Object.keys(set) });
      }

      // JOB-001：分出口导出状态（独立隔离，一个失败不影响其他）
      const outletStatusMatch = path.match(/^\/v1\/versions\/([\w-]+)\/outlet-status$/);
      if (outletStatusMatch && req.method === "GET") {
        return json(res, 200, service.exportOutletStatus(outletStatusMatch[1]));
      }

      if (path === "/v1/versions" && req.method === "GET") {
        return json(res, 200, { versions: service.listVersions().map((v) => ({ id: v.id, label: v.label, status: v.status })) });
      }

      return json(res, 404, { error: "not found" });
    } catch (e) {
      if (e instanceof BodyTooLargeError) return json(res, 413, { error: e.message });
      return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
}

/** 启动服务（返回实际端口）。SEC-001：非回环绑定必须配置 API key，拒绝无认证暴露。 */
export function startApiServer(opts: ServerOptions): Promise<{ server: Server; port: number }> {
  const host = opts.host ?? "127.0.0.1";
  const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(host);
  if (!isLoopback && !opts.apiKey) {
    return Promise.reject(new Error("SEC-001：绑定非回环地址（" + host + "）时必须配置 --api-key，拒绝无认证启动"));
  }
  return new Promise((resolve) => {
    const server = createApiServer(opts);
    server.listen(opts.port ?? 0, host, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}
