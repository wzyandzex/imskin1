import { describe, test, expect } from "vitest";
import { layoutVersionTree, rowPrefix, type TreeNodeLike } from "./versionTree.ts";

const v = (id: string, parentId: string | null): TreeNodeLike => ({ id, parentId });

describe("layoutVersionTree", () => {
  test("线性链：深度递增，末端为 isLast", () => {
    const rows = layoutVersionTree([v("1", null), v("2", "1"), v("3", "2")]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.version.id)).toEqual(["1", "2", "3"]);
    expect(rows[2].isLast).toBe(true);
  });

  test("分叉：一个根两个子 → DFS 前序，首子 isLast=false，末子 isLast=true", () => {
    // 1 ├ 2  └ 3
    const rows = layoutVersionTree([v("1", null), v("2", "1"), v("3", "1")]);
    expect(rows.map((r) => r.version.id)).toEqual(["1", "2", "3"]);
    expect(rows[1]).toMatchObject({ depth: 1, isLast: false });
    expect(rows[2]).toMatchObject({ depth: 1, isLast: true });
  });

  test("嵌套分叉的 guides：非末子分支下的孙节点列有贯穿竖线", () => {
    // 1
    // ├ 2
    // │ └ 4      (4 是 2 的子；2 非末子 → 4 所在行首列画 │)
    // └ 3
    const rows = layoutVersionTree([v("1", null), v("2", "1"), v("3", "1"), v("4", "2")]);
    const order = rows.map((r) => r.version.id);
    expect(order).toEqual(["1", "2", "4", "3"]);
    expect(rowPrefix(rows.find((r) => r.version.id === "2")!)).toBe("├ ");
    const row4 = rows.find((r) => r.version.id === "4")!;
    expect(row4.depth).toBe(2);
    expect(row4.guides).toEqual([true]); // 祖先 2 非末子 → 竖线
    expect(rowPrefix(row4)).toBe("│ └ ");
    expect(rowPrefix(rows.find((r) => r.version.id === "3")!)).toBe("└ ");
  });

  test("多根", () => {
    const rows = layoutVersionTree([v("a", null), v("b", null)]);
    expect(rows[0]).toMatchObject({ depth: 0, isLast: false });
    expect(rows[1]).toMatchObject({ depth: 0, isLast: true });
  });

  test("防御成环不死循环", () => {
    const rows = layoutVersionTree([v("x", "y"), v("y", "x")]);
    // 二者互为父 → 都被当作根（父不在有效链首）或去重，至少不崩、每个至多一次
    expect(rows.length).toBeLessThanOrEqual(2);
  });
});
