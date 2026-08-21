#!/usr/bin/env python3
"""
PINYIN-001 离线词库构建管线：结巴词表 + pypinyin → SeedDict JSON。

用法：
  python tools/build-dict.py [--top 30000] [--out packages/pinyin-engine/src/dict-data.json]

产物格式（与 SeedDict 构造函数 data 参数对齐）：
  { "ni'hao": "你好 你好啊", ... }
  key = 拼音音节序列以 ' 连接；value = 词以空格分隔（按词频降序，rank 自动赋权）。

许可证：结巴 Apache 2.0 + pypinyin MIT → 嵌入分发合规。
"""

import sys
import os
import json

# jieba 的主词典
JIEBA_DICT = os.path.join(os.path.dirname(jieba.__file__), "dict.txt") if (jieba := __import__("jieba")) else None
import jieba  # noqa: E402
from pypinyin import pinyin, Style  # noqa: E402


def build_dict(top_n: int = 30000) -> dict:
    """从结巴 dict.txt 读词+词频 → pypinyin 标注 → SeedDict 格式。"""
    if not JIEBA_DICT or not os.path.exists(JIEBA_DICT):
        print(f"ERROR: jieba dict.txt not found at {JIEBA_DICT}", file=sys.stderr)
        sys.exit(1)

    entries = []  # [(word, freq), ...]
    with open(JIEBA_DICT, encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) < 2:
                continue
            word = parts[0]
            try:
                freq = int(parts[1])
            except ValueError:
                continue
            # 只保留纯汉字词（结巴 dict.txt 含非汉字条目）
            if not all("\u4e00" <= ch <= "\u9fff" for ch in word):
                continue
            entries.append((word, freq))

    # 按词频降序取前 top_n
    entries.sort(key=lambda x: -x[1])
    entries = entries[:top_n]
    print(f"  源词表: {len(entries)} 词条（截取前 {top_n}）", file=sys.stderr)

    # 拼音标注 → 按 key 分组
    result = {}
    skipped = 0
    for word, freq in entries:
        # pypinyin 返回 [[syllable], ...]；单字词给单音节
        pys = pinyin(word, style=Style.NORMAL, errors="ignore")
        flat = [p[0] for p in pys if p and p[0]]
        if len(flat) != len(word):
            skipped += 1
            continue  # 部分字无拼音（生僻字）→ 跳过
        key = "'".join(flat)
        if key not in result:
            result[key] = []
        result[key].append(word)

    # value 从列表转空格分隔串（已按词频降序，书写次序即频率序）
    for k in result:
        result[k] = " ".join(result[k])

    print(f"  生成 {len(result)} 拼音键，跳过 {skipped} 无拼音词", file=sys.stderr)
    return result


if __name__ == "__main__":
    top = 30000
    out = "packages/pinyin-engine/src/dict-data.json"
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--top" and i + 1 < len(args):
            top = int(args[i + 1])
        elif a == "--out" and i + 1 < len(args):
            out = args[i + 1]

    print(f"PINYIN-001 build-dict: top={top}, out={out}", file=sys.stderr)
    data = build_dict(top)

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(out) / 1024
    print(f"  写入 {out}（{size_kb:.0f} KB, {len(data)} 键）", file=sys.stderr)
