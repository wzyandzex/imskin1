/**
 * EVID-001a：真机安装证据 manifest 生成工具（docs/05 §6 格式）。
 *
 * 作用：把"该被验证的包"固化成可审计骨架——artifact 的 SHA-256/字节数在生成时锁定，
 * 场景清单预置为 pending；验证人按 docs/evidence/outlets/<outlet>/README.md 执行后
 * 回填结果。未回填/未全 pass 的 manifest **不得**支撑 install_verified 声明。
 */

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface EvidenceManifest {
  evidenceId: string;
  outlet: string;
  deliveryLevelClaim: string;
  source: { generatedBy: string; gitHint: string };
  artifact: { fileName: string; byteLength: number; sha256: string };
  client: { name: string; version: string; source: string };
  environment: { os: string; device: string | null; density: string | null };
  installSteps: string[];
  scenarios: Array<{ id: string; result: "pending" | "pass" | "fail"; note: string }>;
  requiredScenarios: string[];
  failures: unknown[];
  verifier: { name: string; date: string };
  knownLimitations: string[];
}

export const REQUIRED_SCENARIOS = [
  "recognized",      // 客户端识别包
  "installed",       // 安装成功
  "listed",          // 出现在皮肤列表
  "enabled",         // 可启用
  "visuals",         // 关键视觉显示（候选窗/拼音串/状态栏）
  "states",          // 关键状态切换（中英/候选翻页）
  "restart",         // 客户端重启后仍可用
] as const;

export async function buildEvidenceManifest(opts: {
  outlet: string;
  artifactPath: string;
  clientName?: string;
  clientVersion?: string;
}): Promise<EvidenceManifest> {
  const bytes = await readFile(opts.artifactPath);
  const fileName = opts.artifactPath.split(/[\\/]/).pop() ?? opts.artifactPath;
  return {
    evidenceId: `ev_${randomUUID().slice(0, 8)}`,
    outlet: opts.outlet,
    deliveryLevelClaim: "install_verified（待验证：场景全部回填 pass 前不得声明）",
    source: {
      generatedBy: "imskin evidence CLI (EVID-001a)",
      gitHint: "回填时请补充生成该包的提交号/源码状态",
    },
    artifact: {
      fileName,
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    client: {
      name: opts.clientName ?? "待填写（如：搜狗输入法 PC 版）",
      version: opts.clientVersion ?? "待填写（安装后从 关于/设置 查看）",
      source: "official（必须官网下载，不用论坛/网盘镜像）",
    },
    environment: {
      os: "待填写（如 Windows 11 23H2）",
      device: null,
      density: null,
    },
    installSteps: [
      "从官网安装指定版本客户端（记录版本号）",
      "双击生成的 .ssf 文件（或按 README 的导入方式）",
      "在皮肤列表中找到该皮肤并启用",
      "逐项执行 scenarios 并截图（命名：01-recognized.png 起）",
      "重启客户端，确认皮肤仍可用",
    ],
    scenarios: REQUIRED_SCENARIOS.map((id) => ({ id, result: "pending" as const, note: "" })),
    requiredScenarios: [...REQUIRED_SCENARIOS],
    failures: [],
    verifier: { name: "待填写（验证人）", date: new Date().toISOString().slice(0, 10) },
    knownLimitations: [],
  };
}
