/**
 * CLI（`imskin`）—— 直接调用本地引擎（零依赖 TS 跑在 Node），供自动化脚本/CI 使用。
 *
 * 用法：
 *   imskin generate "国潮水墨风格，主色墨黑" [--name 名字] [--out dir] [--confirm]   # 生成并导出四出口（未确认→实验包 -experimental）
 *   imskin serve [--port 7317] [--api-key KEY]                          # 启动本地 REST server
 *   imskin feedback <versionId> "候选词字太小"                            # 反馈迭代（配合 serve 状态）
 *
 * LLM 接入：读环境变量（IMSKIN_LLM_BASE_URL/IMSKIN_LLM_MODEL/IMSKIN_LLM_API_KEY，或
 * OPENAI_API_KEY / OLLAMA_HOST / DEEPSEEK_API_KEY），见 llm-core/registryFromEnv。
 * 无 LLM 配置时自动用确定性启发式（降级，不中断）。
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AutomationService } from "./service.ts";
import { startApiServer } from "./server.ts";
import { registryFromEnv } from "@imskin/llm-core";
import { buildEvidenceManifest } from "./evidence.ts";

function parseArgs(argv: string[]): { cmd: string; positional: string[]; flags: Record<string, string> } {
  const [cmd = "", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(a);
    }
  }
  return { cmd, positional, flags };
}

async function cmdGenerate(args: string[], flags: Record<string, string>): Promise<void> {
  const idea = args.join(" ");
  if (!idea) throw new Error('用法: imskin generate "想法" [--name 名字] [--out dir]');
  const registry = registryFromEnv(process.env);
  const service = new AutomationService({ registry: registry.available ? registry : null, projectName: flags.name ?? "CLI 项目" });
  const job = service.generateSync({ idea, name: flags.name, llm: flags.llm });
  // 等终态
  const deadline = Date.now() + 30_000;
  while (!["succeeded", "failed"].includes(job.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 30));
  }
  if (job.status === "failed" || !job.result) throw new Error(`生成失败: ${job.error ?? "unknown"}`);
  const versionId = job.result.versionId;
  console.log(`✔ 生成版本 ${versionId}（${job.result.label}）${job.result.fellBack ? "（LLM 降级为确定性）" : `（LLM: ${job.result.llmProvider}）`}`);

  // UX-003：默认产物为未确认「实验包」（文件名带 -experimental）；--confirm 显式走定稿确认。
  if (flags.confirm === "true") {
    try {
      service.orch.store.confirmVersion(versionId);
      console.log("  已确认此版本（confirmed）");
    } catch (e) {
      console.warn(`  ⚠ 确认失败：${e instanceof Error ? e.message : String(e)}（按实验包导出）`);
    }
  }
  const confirmed = service.orch.store.getVersion(versionId)?.status === "confirmed";
  const suffix = confirmed ? "" : "-experimental";

  if (flags.out) {
    const set = service.export(versionId);
    await mkdir(flags.out, { recursive: true });
    const files: Array<[string, Uint8Array]> = [
      [`${job.result.label}-sogou-pc${suffix}.ssf`, set.sogouPc],
      [`${job.result.label}-sogou-mobile${suffix}.ssf`, set.sogouMobile],
      [`${job.result.label}-baidu-pc${suffix}.bps`, set.baiduPc],
      [`${job.result.label}-baidu-mobile${suffix}.bds`, set.baiduMobile],
    ];
    if (!confirmed) {
      console.log("  ⚠ 未确认版本 → 实验包（结构骨架，非可安装正式包；UX-003 / ADR-008）");
    }
    for (const [name, bytes] of files) {
      await writeFile(join(flags.out, name), bytes);
      console.log(`  导出 ${name}`);
    }
  }
}

async function cmdServe(flags: Record<string, string>): Promise<void> {
  const registry = registryFromEnv(process.env);
  const service = new AutomationService({ registry: registry.available ? registry : null });
  const { port } = await startApiServer({
    service,
    apiKey: flags["api-key"] ?? process.env.IMSKIN_API_KEY,
    port: flags.port ? parseInt(flags.port, 10) : 7317,
  });
  console.log(`IMSkin API 已启动: http://127.0.0.1:${port}`);
  console.log(`  POST /v1/generations   创建生成任务`);
  console.log(`  GET  /v1/versions/:id/export?outlet=sogouPc  导出生出口包`);
}

/** EVID-001a：为待验证的皮肤包生成证据 manifest 骨架（docs/05 §6）。 */
async function cmdEvidence(flags: Record<string, string>): Promise<void> {
  const artifact = flags.artifact;
  if (!artifact) throw new Error('用法: imskin evidence --artifact <包路径> [--outlet sogou_pc] [--out manifest.json] [--client 名] [--client-version 版本]');
  const manifest = await buildEvidenceManifest({
    outlet: flags.outlet ?? "sogou_pc",
    artifactPath: artifact,
    clientName: flags.client,
    clientVersion: flags["client-version"],
  });
  const json = JSON.stringify(manifest, null, 2);
  if (flags.out) {
    await mkdir(dirname(flags.out), { recursive: true });
    await writeFile(flags.out, json, "utf8");
    console.log(`✔ 证据骨架已写入 ${flags.out}`);
  } else {
    console.log(json);
  }
  console.log(`  下一步：按 docs/evidence/outlets/${manifest.outlet === "sogou_pc" ? "sogou-pc" : manifest.outlet}/README.md 完成真机验证并回填场景结果`);
}

export async function runCli(argv: string[]): Promise<void> {
  const { cmd, positional, flags } = parseArgs(argv);
  switch (cmd) {
    case "generate":
      return cmdGenerate(positional, flags);
    case "serve":
      return cmdServe(flags);
    case "evidence":
      return cmdEvidence(flags);
    case "":
    case "help":
    case "--help":
      console.log("用法: imskin generate <想法> [--name 名字] [--out dir] [--confirm] | imskin serve [--port 7317] [--api-key KEY] | imskin evidence --artifact <包> [--outlet sogou_pc] [--out manifest.json]");
      return;
    default:
      throw new Error(`未知命令: ${cmd}（generate | serve | help）`);
  }
}

// 直接执行时（node src/cli.ts ...）
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "");
if (isMain) {
  runCli(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
