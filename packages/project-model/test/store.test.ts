import { test } from "node:test";
import assert from "node:assert/strict";

import { ProjectStore } from "../src/index.ts";
import type { Version } from "../src/index.ts";

/** 便捷：取版本 id 序列，用于顺序断言。 */
const ids = (vs: Version[]): string[] => vs.map((v) => v.id);

test("建项目与加根版本：确定性 id、默认状态与 null 父", () => {
  const store = new ProjectStore();
  const p = store.createProject("我的皮肤");
  assert.equal(p.id, "p1");
  assert.equal(p.name, "我的皮肤");
  assert.equal(p.createdAt, undefined); // 未注入时钟 ⇒ 不写入创建时间

  const root = store.addVersion(p.id); // parentId 省略 = 根
  assert.equal(root.id, "v1");
  assert.equal(root.projectId, "p1");
  assert.equal(root.parentId, null);
  assert.equal(root.status, "draft"); // 默认草稿
  assert.deepEqual(root.data, {});

  // 第二个项目与版本延续自增计数
  const p2 = store.createProject("第二个");
  assert.equal(p2.id, "p2");
  assert.equal(store.addVersion(p2.id).id, "v2");
});

test("createProject 支持 targetPlatforms；注入时钟写入 createdAt", () => {
  const store = new ProjectStore({ now: () => "2026-07-05T00:00:00.000Z" });
  const p = store.createProject("四出口", {
    targetPlatforms: ["sogou_pc", "baidu_mobile"],
  });
  assert.deepEqual(p.targetPlatforms, ["sogou_pc", "baidu_mobile"]);
  assert.equal(p.createdAt, "2026-07-05T00:00:00.000Z");
});

test("addVersion 显式 parentId 建立父子链接；跨项目父版本被拒", () => {
  const store = new ProjectStore();
  const p = store.createProject("P");
  const root = store.addVersion(p.id);
  const child = store.addVersion(p.id, { parentId: root.id, status: "ready" });
  assert.equal(child.parentId, root.id);
  assert.equal(child.status, "ready");

  const other = store.createProject("其它");
  // 父版本不属于该项目 ⇒ 抛错
  assert.throws(() => store.addVersion(other.id, { parentId: root.id }), /不属于项目/);
});

test("fork：parentId 正确、继承父 data、overrides 覆盖", () => {
  const store = new ProjectStore();
  const p = store.createProject("P");
  const root = store.addVersion(p.id, { data: { theme: "light", keyRadius: 8 } });

  const forked = store.fork(root.id, {
    label: "试试大圆角",
    data: { keyRadius: 16 }, // 覆盖 keyRadius，保留继承的 theme
  });
  assert.equal(forked.parentId, root.id); // fork 的 parentId == 被 fork 版本
  assert.equal(forked.projectId, p.id);
  assert.equal(forked.status, "draft");
  assert.equal(forked.label, "试试大圆角");
  assert.deepEqual(forked.data, { theme: "light", keyRadius: 16 });
});

test("lineage：从根到叶顺序正确（含自身）", () => {
  const store = new ProjectStore();
  const p = store.createProject("P");
  const root = store.addVersion(p.id); // v1
  const mid = store.fork(root.id); // v2，父 v1
  const leaf = store.fork(mid.id); // v3，父 v2

  assert.deepEqual(ids(store.lineage(leaf.id)), ["v1", "v2", "v3"]);
  assert.deepEqual(ids(store.lineage(root.id)), ["v1"]); // 根的血缘只有自身
});

test("children：直接子版本按插入顺序返回", () => {
  const store = new ProjectStore();
  const p = store.createProject("P");
  const root = store.addVersion(p.id); // v1
  const a = store.fork(root.id); // v2
  const b = store.addVersion(p.id, { parentId: root.id }); // v3
  const c = store.fork(root.id); // v4
  // a 再生一个孙子，确保 children 只取直接子
  store.fork(a.id); // v5，父 v2

  assert.deepEqual(ids(store.children(root.id)), [a.id, b.id, c.id]);
  assert.deepEqual(ids(store.children(a.id)), ["v5"]);
  assert.deepEqual(store.children("v3"), []); // 无子
  assert.deepEqual(store.children("不存在"), []); // 未知 id ⇒ []
});

test("mergeElement：产出新版本、父为 to、记录来源并搬运元素", () => {
  const store = new ProjectStore();
  const p = store.createProject("P");
  // to：当前版本，候选栏为 A，键盘为 KB
  const to = store.addVersion(p.id, {
    data: { candidateBar: "候选栏A", keyboard: "键盘KB" },
  });
  // from：历史版本，候选栏为 B
  const from = store.addVersion(p.id, { data: { candidateBar: "候选栏B" } });

  const merged = store.mergeElement(from.id, to.id, "candidateBar");
  assert.notEqual(merged.id, to.id); // 是新版本
  assert.equal(merged.parentId, to.id); // 以 to 为父
  assert.equal(merged.data?.candidateBar, "候选栏B"); // 搬运了 from 的元素
  assert.equal(merged.data?.keyboard, "键盘KB"); // 继承 to 的其它元素
  // DOM-002：合并溯源升级为 MergeRecord（elementId 兼容保留 + 完整路径 + 变更清单）
  assert.deepEqual(merged.data?.mergedFrom, {
    elementId: "candidateBar",
    elementPath: "candidateBar",
    fromVersionId: from.id,
    changedPaths: ["candidateBar"],
  });

  // merge 不改动原 to / from 版本
  assert.equal(store.getVersion(to.id)?.data?.candidateBar, "候选栏A");
});

test("mergeElement：跨项目合并抛错", () => {
  const store = new ProjectStore();
  const p1 = store.createProject("P1");
  const p2 = store.createProject("P2");
  const v1 = store.addVersion(p1.id);
  const v2 = store.addVersion(p2.id);
  assert.throws(() => store.mergeElement(v1.id, v2.id, "candidateBar"), /跨项目/);
});

test("满意标记：增/查/列，来源可更新，未知版本视为未满意", () => {
  const store = new ProjectStore();
  const p = store.createProject("P");
  const v = store.addVersion(p.id);

  assert.equal(store.isSatisfied(v.id, "candidateBar"), false);
  store.markSatisfied(v.id, "candidateBar", "explicit");
  store.markSatisfied(v.id, "keyboard", "inferred");
  assert.equal(store.isSatisfied(v.id, "candidateBar"), true);
  assert.deepEqual(store.satisfiedElements(v.id), ["candidateBar", "keyboard"]);

  // 重复标记更新 source，不重复入列
  store.markSatisfied(v.id, "candidateBar", "inferred");
  assert.deepEqual(store.satisfiedElements(v.id), ["candidateBar", "keyboard"]);

  // 未知版本：读放行为空/假
  assert.equal(store.isSatisfied("不存在", "x"), false);
  assert.deepEqual(store.satisfiedElements("不存在"), []);
});

test("非法 id 处理：读放行、写/血缘抛错", () => {
  const store = new ProjectStore();
  const p = store.createProject("P");
  store.addVersion(p.id);

  // 读：未知版本返回 undefined；未知项目返回 []
  assert.equal(store.getVersion("v999"), undefined);
  assert.deepEqual(store.listVersions("p999"), []);

  // 写 / 血缘：未知目标抛错
  assert.throws(() => store.addVersion("p999"), /未知项目/);
  assert.throws(() => store.fork("v999"), /未知版本/);
  assert.throws(() => store.lineage("v999"), /未知版本/);
  assert.throws(() => store.mergeElement("v999", "v999", "x"), /未知版本/);
  assert.throws(() => store.markSatisfied("v999", "x", "explicit"), /未知版本/);
});

test("listVersions 只含本项目版本；返回快照，外部改动不污染内部", () => {
  const store = new ProjectStore();
  const p1 = store.createProject("P1");
  const p2 = store.createProject("P2");
  store.addVersion(p1.id); // v1
  store.addVersion(p2.id); // v2
  store.addVersion(p1.id); // v3

  assert.deepEqual(ids(store.listVersions(p1.id)), ["v1", "v3"]);
  assert.deepEqual(ids(store.listVersions(p2.id)), ["v2"]);

  // 快照隔离：改动返回值的 data 顶层键不影响 store，也不影响后续 fork 的继承
  const snap = store.getVersion("v1")!;
  snap.data!.injected = "脏数据";
  assert.equal(store.getVersion("v1")?.data?.injected, undefined);
  const forked = store.fork("v1");
  assert.equal(forked.data?.injected, undefined);
});

test("快照往返：projects/versions/marks/自增计数完整保留，且树结构不变", () => {
  const store = new ProjectStore();
  const p = store.createProject("皮肤A", { targetPlatforms: ["sogou-pc"] });
  const v1 = store.addVersion(p.id, { data: { skin: { name: "根" } }, label: "根" });
  const v2 = store.fork(v1.id, { label: "子" });
  store.markSatisfied(v2.id, "candidate", "explicit");

  const restored = ProjectStore.fromSnapshot(store.snapshot());

  // 版本与血缘一致
  assert.deepEqual(ids(restored.listVersions(p.id)), [v1.id, v2.id]);
  assert.equal(restored.getVersion(v2.id)?.parentId, v1.id);
  assert.deepEqual(restored.getVersion(v1.id)?.data, { skin: { name: "根" } });
  assert.equal(restored.isSatisfied(v2.id, "candidate"), true);
  assert.equal(restored.getVersion(v1.id)?.label, "根");

  // 自增计数保留：恢复后新增版本不与历史 id 冲突
  const v3 = restored.addVersion(p.id, { parentId: v2.id });
  assert.equal(v3.id, "v3");
  // 恢复后新增项目同理
  const p2 = restored.createProject("皮肤B");
  assert.equal(p2.id, "p2");
});

test("快照是深拷贝：改动快照对象不污染原 store", () => {
  const store = new ProjectStore();
  const p = store.createProject("X");
  store.addVersion(p.id, { data: { n: 1 } });
  const snap = store.snapshot();
  snap.versions[0].data!.n = 999;
  assert.equal(store.getVersion("v1")?.data?.n, 1);
});

// —— UX-003 定稿确认：ready → confirmed 转移规则 ——
test("confirmVersion：ready 可确认；确认状态进入快照并随快照恢复", () => {
  const store = new ProjectStore();
  const p = store.createProject("X");
  store.addVersion(p.id, { status: "ready" });
  const v = store.confirmVersion("v1");
  assert.equal(v.status, "confirmed");
  assert.equal(store.getVersion("v1")?.status, "confirmed");

  const restored = ProjectStore.fromSnapshot(store.snapshot());
  assert.equal(restored.getVersion("v1")?.status, "confirmed"); // 持久化往返保留
});

test("confirmVersion：draft（自检未过）与重复确认抛可展示错误", () => {
  const store = new ProjectStore();
  const p = store.createProject("X");
  store.addVersion(p.id, { status: "draft" });
  assert.throws(() => store.confirmVersion("v1"), /自检未通过/);

  store.addVersion(p.id, { status: "ready" });
  store.confirmVersion("v2");
  assert.throws(() => store.confirmVersion("v2"), /已确认/);

  assert.throws(() => store.confirmVersion("v404"), /未知版本/);
});

test("确认后反馈 fork：新版本不继承 confirmed（导出门禁自动回落）", () => {
  const store = new ProjectStore();
  const p = store.createProject("X");
  store.addVersion(p.id, { status: "ready" });
  store.confirmVersion("v1");
  const child = store.fork("v1", { status: "ready", data: {} }); // orchestrator.applyFeedback 的路径
  assert.equal(child.status, "ready");
  assert.notEqual(child.status, "confirmed");
  assert.equal(store.getVersion("v1")?.status, "confirmed"); // 父版本确认不受影响
});

// —— DOM-002：嵌套路径合并 / 无差异拒绝 / 深层不可变 / 坏快照拒绝 ——
test("mergeElement 嵌套路径：只搬运指定字段，其余嵌套内容保留", () => {
  const store = new ProjectStore();
  const p = store.createProject("P");
  const to = store.addVersion(p.id, {
    data: { spec: { candidateBar: { fontSize: 14, color: "#111" }, keyboard: { radius: 8 } } },
  });
  const from = store.addVersion(p.id, {
    data: { spec: { candidateBar: { fontSize: 20, color: "#222" } } },
  });

  const merged = store.mergeElement(from.id, to.id, "spec.candidateBar.fontSize");
  const spec = merged.data?.spec as Record<string, Record<string, unknown>>;
  assert.equal(spec.candidateBar.fontSize, 20); // 搬运了目标字段
  assert.equal(spec.candidateBar.color, "#111"); // 同对象其它字段保留 to 的
  assert.equal(spec.keyboard.radius, 8); // 兄弟子树不受影响
  assert.deepEqual((merged.data?.mergedFrom as Record<string, unknown>).changedPaths, ["spec.candidateBar.fontSize"]);

  // 源/目标版本不被改动（深拷贝搬运）
  const fromSpec = (store.getVersion(from.id)?.data?.spec as Record<string, Record<string, unknown>>);
  assert.equal(fromSpec.candidateBar.color, "#222");
  const toSpec = (store.getVersion(to.id)?.data?.spec as Record<string, Record<string, unknown>>);
  assert.equal(toSpec.candidateBar.fontSize, 14);
});

test("mergeElement：路径不存在 / 值无差异 → 抛错且不产生版本", () => {
  const store = new ProjectStore();
  const p = store.createProject("P");
  const v1 = store.addVersion(p.id, { data: { a: { b: 1 } } });
  const v2 = store.addVersion(p.id, { data: { a: { b: 1 } } });
  const v3 = store.addVersion(p.id, { data: { a: { b: 2 } } });

  assert.throws(() => store.mergeElement(v1.id, v2.id, "a.c"), /不存在元素路径/);
  assert.throws(() => store.mergeElement(v1.id, v2.id, "a.b"), /无差异/); // 两版同为 1
  assert.equal(store.listVersions(p.id).length, 3); // 没有空版本节点产生
  assert.doesNotThrow(() => store.mergeElement(v3.id, v2.id, "a.b")); // 有差异正常合并
});

test("DOM-002 深层不可变：快照与 fork 切断嵌套引用共享", () => {
  const store = new ProjectStore();
  const p = store.createProject("P");
  const parent = store.addVersion(p.id, {
    data: { spec: { nested: { value: 1 } } },
  });

  // 读取快照改嵌套字段 → store 内部不受影响
  const snap = store.getVersion(parent.id)!;
  (snap.data!.spec as Record<string, unknown>).nested = { value: 999 };
  const again = store.getVersion(parent.id)!;
  assert.deepEqual((again.data!.spec as Record<string, { value: number }>).nested, { value: 1 });

  // fork 子版本：改子版 data 嵌套字段 → 父版本不受影响
  const child = store.fork(parent.id, { data: { spec: { nested: { value: 1 } } } });
  ((store.getVersion(child.id)!.data!.spec as Record<string, unknown>));
  const childSnap = store.getVersion(child.id)!;
  const childSpec = childSnap.data!.spec as Record<string, { value: number }>;
  childSpec.nested.value = 42; // 改的是深拷贝快照
  const parentAfter = store.getVersion(parent.id)!;
  assert.deepEqual((parentAfter.data!.spec as Record<string, { value: number }>).nested, { value: 1 });
  assert.deepEqual((store.getVersion(child.id)!.data!.spec as Record<string, { value: number }>).nested, { value: 1 });
});

test("DOM-002 快照深拷贝：snapshot() 的嵌套改动不污染 store（升级既有浅拷贝用例）", () => {
  const store = new ProjectStore();
  const p = store.createProject("X");
  store.addVersion(p.id, { data: { n: { deep: 1 } } });
  const snap = store.snapshot();
  (snap.versions[0].data as Record<string, { deep: number }>).n.deep = 999;
  const v = store.getVersion("v1")!.data as Record<string, { deep: number }>;
  assert.equal(v.n.deep, 1); // 嵌套字段也被隔离（旧实现只隔离顶层）
});

test("DOM-002 坏快照拒绝：结构/枚举/引用非法 → fromSnapshot 抛错", () => {
  const good = new ProjectStore();
  const p = good.createProject("P");
  good.addVersion(p.id, { status: "ready", data: { x: 1 } });
  const base = good.snapshot();
  assert.doesNotThrow(() => ProjectStore.fromSnapshot(base)); // 合法基线

  const clone = (o: unknown) => JSON.parse(JSON.stringify(o));
  assert.throws(() => ProjectStore.fromSnapshot(null as unknown as Parameters<typeof ProjectStore.fromSnapshot>[0]), /不是对象/);
  assert.throws(() => ProjectStore.fromSnapshot({ ...clone(base), versions: "nope" }), /versions 必须是数组/);
  assert.throws(() => ProjectStore.fromSnapshot({ ...clone(base), projectSeq: -1 }), /projectSeq/);
  const badStatus = clone(base);
  badStatus.versions[0].status = "shipped";
  assert.throws(() => ProjectStore.fromSnapshot(badStatus), /状态非法/);
  const orphan = clone(base);
  orphan.versions[0].projectId = "p404";
  assert.throws(() => ProjectStore.fromSnapshot(orphan), /不在项目中/);
  const badParent = clone(base);
  badParent.versions[0].parentId = "v404";
  assert.throws(() => ProjectStore.fromSnapshot(badParent), /父版本不存在/);
  const badMark = clone(base);
  badMark.marks.push({ versionId: "v1", elementId: "x", source: "maybe" as never });
  assert.throws(() => ProjectStore.fromSnapshot(badMark), /来源非法/);
});
