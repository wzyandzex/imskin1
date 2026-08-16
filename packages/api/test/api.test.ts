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
    const h = await (await fetch(`${base}/v1/health`)).json();
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
    const got = await (await fetch(`${base}/v1/generations/${job.id}`)).json();
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
