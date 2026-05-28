#!/usr/bin/env python3
"""生成新的微博 Markdown 文件"""
import json
import os
from datetime import datetime

# ====== 配置 ======
JSON_PATH = "/mnt/c/Users/jam08/Downloads/weibo_1041241542_2026-05-28 (1).json"
OUTPUT_DIR = "/mnt/c/Users/jam08/OneDrive/文档/微博拆分"
LAST_SEQ = 4509  # 最后一个序号

# ====== 时间解析 ======
def parse_date(time_str):
    """将 'Thu May 28 13:12:51 +0800 2026' 转为 '2026.05.28'"""
    if not time_str:
        return "unknown"
    parts = time_str.split()
    if len(parts) >= 6:
        month_map = {"Jan":"01","Feb":"02","Mar":"03","Apr":"04","May":"05","Jun":"06",
                     "Jul":"07","Aug":"08","Sep":"09","Oct":"10","Nov":"11","Dec":"12"}
        return f"{parts[5]}.{month_map.get(parts[1],'00')}.{parts[2].zfill(2)}"
    return "unknown"

def parse_datetime(time_str):
    """转为 datetime 对象用于排序"""
    if not time_str:
        return datetime.min
    parts = time_str.split()
    if len(parts) >= 6:
        month_map = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,
                     "Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12}
        t = parts[3].split(":")
        return datetime(int(parts[5]), month_map.get(parts[1],1), int(parts[2]),
                       int(t[0]), int(t[1]), int(t[2]))
    return datetime.min

# ====== 读取 JSON ======
with open(JSON_PATH, "r", encoding="utf-8") as f:
    data = json.load(f, strict=False)

# 筛选新微博（2026.01.31 之后）
new_posts = [p for p in data["posts"] if parse_date(p.get("time", "")) > "2026.01.31"]
new_posts.sort(key=lambda p: parse_datetime(p.get("time", "")))

print(f"新微博: {len(new_posts)} 条")
print(f"序号范围: {LAST_SEQ + 1} ~ {LAST_SEQ + len(new_posts)}")

# ====== 生成文件 ======
created = 0
for idx, post in enumerate(new_posts):
    seq = LAST_SEQ + 1 + idx
    date_str = parse_date(post.get("time", ""))
    fname = f"微博-{date_str}-{seq:05d}.md"
    fpath = os.path.join(OUTPUT_DIR, fname)
    
    # 正文
    text = post.get("text", "").strip()
    
    # 如果 text 为空，跳过
    if not text:
        continue
    
    # 在正文末尾追加日期签名
    text_with_date = text + " - " + date_str
    
    # 生成 Markdown 内容
    md = f"""---
type: 微博
date: {date_str}
tags: []
description: ""
---

{text_with_date}"""
    
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(md)
    created += 1
    
    if created <= 3 or created > len(new_posts) - 3:
        print(f"  [{created}/{len(new_posts)}] {fname} ({len(text)}字)")

print(f"\n✅ 共生成 {created} 个文件")
print(f"📁 存储目录: {OUTPUT_DIR}")
