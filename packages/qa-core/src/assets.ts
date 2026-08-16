/**
 * G2 资产完整性检查（ASSET-001，docs/03 §7）。
 *
 * 输入：出口 AssetProfile + token 存在性探针（config 载体）+ 已注册位图描述符。
 * 输出：结构化 QAIssue（error 阻断 install_candidate）+ 必需缺口清单。
 * 诚实边界：不假装位图存在；图像管道未接入时缺口如实列出。
 */

import type { AssetProfileV1, AssetDescriptorV1, AssetRole } from "@imskin/contracts";
import { isAssetDescriptor } from "@imskin/contracts";
import type { QAIssue } from "./types.ts";

export interface AssetCheckResult {
  issues: QAIssue[];
  /** 必需但缺失的角色（阻断 install_candidate 的清单）。 */
  missingRequired: AssetRole[];
  /** 已满足的必需角色。 */
  satisfiedRequired: AssetRole[];
}

export interface AssetCheckInput {
  profile: AssetProfileV1;
  /** config 载体角色的 token 探针：给点分路径，返回 VisualSpec 上是否存在且非空。 */
  hasToken: (tokenPath: string) => boolean;
  /** 已注册位图资产（当前管道通常为空数组——缺口即事实）。 */
  assets: unknown[];
}

export function checkAssetBundle(input: AssetCheckInput): AssetCheckResult {
  const issues: QAIssue[] = [];
  const missingRequired: AssetRole[] = [];
  const satisfiedRequired: AssetRole[] = [];

  const assets = input.assets.filter(isAssetDescriptor);
  // 非法描述符不进清单，但记 warning（来源管道问题可见）。
  const rejected = input.assets.length - assets.length;
  if (rejected > 0) {
    issues.push({ code: "ASSET_DESCRIPTOR_INVALID", severity: "warning", message: `${rejected} 个资产描述符非法（缺 hash/尺寸/来源），已忽略` });
  }

  const byRole = new Map<AssetRole, AssetDescriptorV1[]>();
  for (const a of assets) {
    const list = byRole.get(a.role) ?? [];
    list.push(a);
    byRole.set(a.role, list);
  }

  for (const entry of input.profile.entries) {
    if (entry.carrier === "config") {
      if (entry.tokenPath && input.hasToken(entry.tokenPath)) {
        if (entry.required) satisfiedRequired.push(entry.role);
      } else if (entry.required) {
        missingRequired.push(entry.role);
        issues.push({
          code: "ASSET_CONFIG_TOKEN_MISSING",
          severity: "error",
          message: `必需配置缺失：${entry.role}（token ${entry.tokenPath ?? "未指定"}）`,
          where: entry.role,
        });
      }
      continue;
    }

    // bitmap 载体
    const candidates = byRole.get(entry.role) ?? [];
    if (candidates.length === 0) {
      if (entry.required) {
        missingRequired.push(entry.role);
        issues.push({
          code: "ASSET_MISSING",
          severity: "error",
          message: `必需位图缺失：${entry.role}（${(entry.mediaTypes ?? []).join("/") || "未限定格式"}）`,
          where: entry.role,
        });
      }
      continue;
    }
    // 媒体类型 / hash 形态（guard 已验 hash；这里验 mediaTypes 白名单）
    const badType = entry.mediaTypes
      ? candidates.filter((c) => !entry.mediaTypes!.includes(c.mediaType))
      : [];
    if (badType.length === candidates.length) {
      missingRequired.push(entry.role);
      issues.push({
        code: "ASSET_MEDIA_TYPE_MISMATCH",
        severity: "error",
        message: `位图 ${entry.role} 的媒体类型不在允许清单（${(entry.mediaTypes ?? []).join("/")}）`,
        where: entry.role,
      });
      continue;
    }
    if (entry.required) satisfiedRequired.push(entry.role);
  }

  // 孤儿资产（角色不在画像内）→ warning（不阻断，但暴露管道错配）
  const known = new Set(input.profile.entries.map((e) => e.role));
  for (const [role, list] of byRole) {
    if (!known.has(role)) {
      issues.push({ code: "ASSET_ORPHAN", severity: "warning", message: `资产角色 ${role} 不在 ${input.profile.outlet} 画像内（${list.length} 个）`, where: role });
    }
  }

  return { issues, missingRequired, satisfiedRequired };
}
