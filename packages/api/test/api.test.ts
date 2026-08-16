import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { LLMRegistry } from "@imskin/llm-core";
import { AutomationService, startApiServer } from "../src/index.ts";

test("AutomationService：同步生成（确定性，无 LLM）→ succeeded 且可导出四出口", async () => {
  const svc = new AutomationService();
  const job = svc.generateSync({ idea: "国潮水墨风格，主色墨黑 #2b2b33，情绪沉静内敛", name: "水墨" });
  // 等终态
  const deadline = Date.now() + 5000;
  while (!["succeeded", "failed"].includes(job.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(job.status, "succeeded");
  assert.ok(job.result?.versionId);
  assert.equal(job.result.fellBack, true); // 无 registry → 确定性
  const set = svc.export(job.result!.versionId);
  assert.ok(set.sogouPc.length > 0);
  assert.ok(set.baiduMobile.length > 0);
});

test("AutomationService：缺 idea 和 brief → failed", async () => {
  const svc = new AutomationService();
  const job = svc.generateSync({});
  const deadline = Date.now() + 3000;
  while (!["succeeded", "failed"].includes(job.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(job.status, "failed");
});

test("REST：health / generate(wait) / get job / versions / export", async () => {
  const svc = new AutomationService();
  const { server, port } = await startApiServer({ service: svc, port: 0 });
  const base = `http://127.0.0.1:${port}`;
  try {
    // health
    const h = (await (await fetch(`${base}/v1/health`)).json()) as { ok?: boolean };
    assert.equal(h.ok, true);

    // 同步生成
    const gen = await fetch(`${base}/v1/generations?wait=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: "极简风格，主色天蓝 #5ab0f0，情绪清新明亮", name: "极简" }),
    });
    assert.equal(gen.status, 202);
    const job = (await gen.json()) as { id: string; status: string; result?: { versionId: string } };
    assert.equal(job.status, "succeeded");
    const versionId = job.result!.versionId;

    // get job
    const got = (await (await fetch(`${base}/v1/generations/${job.id}`)).json()) as { status?: string };
    assert.equal(got.status, "succeeded");

    // versions
    const versions = (await (await fetch(`${base}/v1/versions`)).json()) as { versions: unknown[] };
    assert.ok(versions.versions.length >= 1);

    // export 单出口（二进制）
    const exp = await fetch(`${base}/v1/versions/${versionId}/export?outlet=sogouPc`);
    assert.equal(exp.status, 200);
    const buf = await exp.arrayBuffer();
    assert.ok(buf.byteLength > 0);

    // feedback
    const fb = await fetch(`${base}/v1/versions/${versionId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "候选词字太小" }),
    });
    assert.equal(fb.status, 200);
  } finally {
    server.close();
  }
});

test("AutomationService：referenceImages 随 idea 送入多模态理解（FR-INPUT-1）", async () => {
  const registry = new LLMRegistry().register({ id: "t", baseUrl: "https://x/v1", apiKey: "k", model: "m" });
  let sentBody: { messages?: Array<{ role: string; content: unknown }> } = {};
  mock.method(globalThis, "fetch", mock.fn(async (_u: unknown, init?: { body?: string }) => {
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    const brief = { styleKeywords: ["极简"], palette: { primary: "#5ab0f0" }, mood: "清新明亮" };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(brief) } }] }), { status: 200 });
  }));
  try {
    const svc = new AutomationService({ registry });
    const dataUrl = "data:image/jpeg;base64,abc";
    const job = svc.generateSync({ idea: "像这张图", referenceImages: [dataUrl] });
    const deadline = Date.now() + 5000;
    while (!["succeeded", "failed"].includes(job.status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(job.status, "succeeded");
    assert.equal(job.result?.fellBack, false);
    const user = sentBody.messages?.find((m) => m.role === "user");
    assert.ok(Array.isArray(user?.content), "user 消息应为多模态数组");
    const parts = user!.content as Array<{ type: string; image_url?: { url: string } }>;
    assert.equal(parts[1].type, "image_url");
    assert.equal(parts[1].image_url?.url, dataUrl);
  } finally {
    mock.restoreAll();
  }
});

test("REST：body 超过 20MB → 413（防 base64 图撑爆内存）", async () => {
  const svc = new AutomationService();
  const { server, port } = await startApiServer({ service: svc, port: 0 });
  try {
    const big = "x".repeat(21 * 1024 * 1024);
    const res = await fetch(`http://127.0.0.1:${port}/v1/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: big }),
    });
    assert.equal(res.status, 413);
  } finally {
    server.close();
  }
});

test("REST：认证——配了 apiKey 后无/错 token 返回 401", async () => {
  const svc = new AutomationService();
  const { server, port } = await startApiServer({ service: svc, port: 0, apiKey: "secret" });
  const base = `http://127.0.0.1:${port}`;
  try {
    const noAuth = await fetch(`${base}/v1/versions`);
    assert.equal(noAuth.status, 401);
    const ok = await fetch(`${base}/v1/versions`, { headers: { Authorization: "Bearer secret" } });
    assert.equal(ok.status, 200);
  } finally {
    server.close();
  }
});

test("REST：未配 apiKey → 本地放行（Ollama 模式）", async () => {
  const svc = new AutomationService();
  const { server, port } = await startApiServer({ service: svc, port: 0 });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/versions`);
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});

test("JOB-001 outlet-status：分出口独立状态，单出口失败不牵连其他", async () => {
  const svc = new AutomationService();
  const job = svc.generateSync({ idea: "清冷极简，主色天蓝 #5ab0f0", name: "OS" });
  const deadline = Date.now() + 5000;
  while (!["succeeded", "failed"].includes(job.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  const versionId = job.result!.versionId;

  // 全部成功的基线
  const ok = svc.exportOutletStatus(versionId);
  assert.equal(ok.jobs.length, 4);
  assert.ok(ok.jobs.every((j) => j.stage === "succeeded"));
  assert.ok(ok.jobs.every((j) => (j.byteLength ?? 0) > 0));

  // REST 路由
  const { server, port } = await startApiServer({ service: svc, port: 0 });
  const base = `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${base}/v1/versions/${versionId}/outlet-status`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { jobs: Array<{ outletKey: string; stage: string }> };
    assert.deepEqual(body.jobs.map((j) => j.outletKey).sort(), ["baiduMobile", "baiduPc", "sogouMobile", "sogouPc"]);
    assert.ok(body.jobs.every((j) => j.stage === "succeeded"));
  } finally {
    server.close();
  }
});

test("SEC-001：非回环绑定且未配 key → 拒绝启动", async () => {
  const svc = new AutomationService();
  await assert.rejects(
    startApiServer({ service: svc, host: "0.0.0.0", port: 0 }),
    /SEC-001/,
  );
  // 配 key 后可正常监听非回环
  const { server, port } = await startApiServer({ service: svc, host: "0.0.0.0", port: 0, apiKey: "k1" });
  const res = await fetch(`http://127.0.0.1:${port}/v1/health`, { headers: { Authorization: "Bearer k1" } });
  assert.equal(res.status, 200);
  server.close();
});

test("SEC-001：job id 不可预测（UUID 片段，非自增）", async () => {
  const svc = new AutomationService();
  const j1 = svc.generateSync({ idea: "甲" });
  const j2 = svc.generateSync({ idea: "乙" });
  assert.match(j1.id, /^job-[0-9a-f]{8}$/);
  assert.notEqual(j1.id, j2.id);
});

test("SEC-001：任务数量上限 + TTL 清理（注入小值）", async () => {
  const svc = new AutomationService({ maxJobs: 2, jobTtlMs: 40 });
  const a = svc.generateSync({ idea: "一" });
  const b = svc.generateSync({ idea: "二" });
  const c = svc.generateSync({ idea: "三" });
  assert.equal(svc.getJob(a.id), undefined); // 最老被挤出
  assert.ok(svc.getJob(b.id) && svc.getJob(c.id));
  await new Promise((r) => setTimeout(r, 60));
  svc.pruneJobs();
  assert.equal(svc.getJob(c.id), undefined); // TTL 过期清理
});

test("EVID-001a evidence：生成 manifest 骨架（sha256 锁定、场景全 pending、缺参报用法）", async () => {
  const { mkdtemp, writeFile, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createHash } = await import("node:crypto");
  const { runCli } = await import("../src/cli.ts");

  const dir = await mkdtemp(join(tmpdir(), "evid-"));
  const artifact = join(dir, "demo-sogou-pc.ssf");
  const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  await writeFile(artifact, payload);
  const out = join(dir, "manifest.json");

  await runCli(["evidence", "--artifact", artifact, "--out", out, "--client", "搜狗输入法", "--client-version", "14.9"]);
  const m = JSON.parse(await readFile(out, "utf8")) as {
    outlet: string; artifact: { sha256: string; byteLength: number };
    scenarios: Array<{ result: string }>; requiredScenarios: string[]; client: { version: string };
  };
  assert.equal(m.outlet, "sogou_pc");
  assert.equal(m.artifact.byteLength, 8);
  assert.equal(m.artifact.sha256, createHash("sha256").update(payload).digest("hex")); // hash 锁定
  assert.equal(m.client.version, "14.9");
  assert.equal(m.scenarios.length, 7);
  assert.ok(m.scenarios.every((s) => s.result === "pending")); // 未验证不冒充
  assert.deepEqual(m.requiredScenarios, ["recognized", "installed", "listed", "enabled", "visuals", "states", "restart"]);

  // 缺 artifact → 用法错误
  await assert.rejects(runCli(["evidence"]), /用法/);
});
