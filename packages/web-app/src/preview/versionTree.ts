/**
 * 版本树布局（§5.5）—— 把扁平的 version 列表（各带 parentId）排成可画分叉连线的行序列，
 * 类似 git log --graph。纯函数、可严格单测；渲染层据每行的 guides/isLast 画 │ ├ └。
 *
 * 规则：按创建顺序 DFS 前序遍历；某行第 i 列画竖线 │ 当且仅当第 i 层祖先"不是其兄弟中的最后一个"
 * （即那一支还有后续兄弟）；行自身的连接符为 ├（非末子）或 └（末子）。
 */

export interface TreeNodeLike {
  id: string;
  parentId: string | null;
}

export interface TreeRow<T extends TreeNodeLike> {
  version: T;
  /** 距根的深度（根为 0）。 */
  depth: number;
  /** 是否是其兄弟中的最后一个（决定用 └ 还是 ├）。 */
  isLast: boolean;
  /** 长度 = max(0, depth-1)：guides[i] 表示第 i 层祖先(不含根、不含自身)那一支是否尚有后续兄弟(画 │)。 */
  guides: boolean[];
}

export function layoutVersionTree<T extends TreeNodeLike>(versions: T[]): TreeRow<T>[] {
  const byId = new Map<string, T>();
  for (const v of versions) byId.set(v.id, v);

  // parentId → 子节点（保持输入顺序）
  const childrenOf = new Map<string, T[]>();
  const roots: T[] = [];
  for (const v of versions) {
    const isRoot = v.parentId === null || !byId.has(v.parentId);
    if (isRoot) {
      roots.push(v);
    } else {
      const list = childrenOf.get(v.parentId!);
      if (list) list.push(v);
      else childrenOf.set(v.parentId!, [v]);
    }
  }

  const rows: TreeRow<T>[] = [];
  const visited = new Set<string>();

  // branchIsLast：从深度 1 到 depth-1 的祖先各自 isLast（不含根、不含自身）。
  const walk = (node: T, branchIsLast: boolean[], isLast: boolean, depth: number): void => {
    if (visited.has(node.id)) return; // 防御脏数据成环
    visited.add(node.id);
    rows.push({
      version: node,
      depth,
      isLast,
      guides: branchIsLast.map((last) => !last),
    });
    const kids = childrenOf.get(node.id) ?? [];
    // 根不占 guide 列；非根节点把自身 isLast 传给下层作为一条竖线依据。
    const childBranch = depth === 0 ? [] : [...branchIsLast, isLast];
    kids.forEach((k, j) => walk(k, childBranch, j === kids.length - 1, depth + 1));
  };

  roots.forEach((r, j) => walk(r, [], j === roots.length - 1, 0));
  return rows;
}

/** 把一行的 guides + 连接符拼成等宽前缀字符串（供渲染直接用）。 */
export function rowPrefix(row: TreeRow<TreeNodeLike>): string {
  let prefix = "";
  for (const g of row.guides) prefix += g ? "│ " : "  ";
  if (row.depth > 0) prefix += row.isLast ? "└ " : "├ ";
  return prefix;
}
