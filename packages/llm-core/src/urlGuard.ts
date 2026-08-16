/**
 * URL 安全守卫（SEC-002，ADR-005）—— 服务端发起外部请求前的边界检查。
 *
 * 规则：
 * - 仅允许 https:，例外：http: 且主机为回环（localhost / 127.0.0.1 / [::1]，本机 Ollama 等）；
 * - 拒绝私网/链路本地/云 metadata IP 字面量（10/8、172.16/12、192.168/16、169.254/16、
 *   100.64/10、0/8、fc00::/7、fe80::/10）——无论协议；
 * - 其他协议（ftp/file/ws…）一律拒绝。
 *
 * 诚实边界：不做 DNS 解析复核（DNS rebinding 属进阶攻击面，登记于风险台账随云部署收口）；
 * 本守卫目标是把"显然不该去的地方"在请求前拦下。
 */

import { LLMError } from "./types.ts";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  const [a, b] = parts;
  if (a === 10 || a === 0 || a === 127) return a !== 127 ? true : false; // 127 由回环分支处理
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // 链路本地 + 云 metadata（169.254.169.254）
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1") return false; // 回环由分支处理
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7 ULA
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true; // fe80::/10 链路本地
  return false;
}

export function isPrivateOrMetadataHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (isIpv4Literal(h)) return isPrivateIpv4(h);
  if (h.includes(":")) return isPrivateIpv6(h);
  return false;
}

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/** 校验并放行；不安全即抛不可重试的 LLMError（消息可直接展示）。 */
export function assertSafeBaseUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LLMError(`endpoint 地址非法：${raw}`, false);
  }
  const host = url.hostname;

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new LLMError(`endpoint 协议不允许（${url.protocol}，仅 https 或本机 http）`, false);
  }
  if (url.protocol === "http:" && !isLoopbackHost(host)) {
    throw new LLMError(`http 仅允许本机回环地址（收到 ${host}）；公网 endpoint 请用 https`, false);
  }
  if (isPrivateOrMetadataHost(host)) {
    throw new LLMError(`endpoint 指向内网/保留地址（${host}），已拒绝（SSRF 防护）`, false);
  }
}
