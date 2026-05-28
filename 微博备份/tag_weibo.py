#!/usr/bin/env python3
"""
批量标引新微博 — 使用 DeepSeek API 生成 tags 和 description
从 auth.json 读取 API key，分批处理
"""
import json
import os
import re
import sys
import time
import requests

# ====== 配置 ======
WEIBO_DIR = "/mnt/c/Users/jam08/OneDrive/文档/微博拆分"
START_SEQ = 4510
END_SEQ = 4840
BATCH_SIZE = 15
API_DELAY = 0.5

# ====== 读取 API Key ======
auth_path = os.path.expanduser("~/.hermes/auth.json")
with open(auth_path) as f:
    auth_data = json.load(f)
DEEPSEEK_API_KEY = auth_data["credential_pool"]["deepseek"][0]["access_token"]

API_BASE = "https://api.deepseek.com/v1"

# ====== 工具函数 ======

def read_md(seq):
    for fname in os.listdir(WEIBO_DIR):
        if fname.endswith(".md") and f"-{seq:05d}." in fname:
            path = os.path.join(WEIBO_DIR, fname)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            m = re.match(r"^---\n(.*?)\n---\n(.*)", content, re.DOTALL)
            if not m:
                return None, content, path, fname
            fm_text = m.group(1)
            body = m.group(2).strip()
            fm = {}
            for line in fm_text.split("\n"):
                if ":" in line:
                    k, v = line.split(":", 1)
                    fm[k.strip()] = v.strip()
            return fm, body, path, fname
    return None, None, None, None

def write_md(path, fm, body):
    lines = ["---"]
    for key in ["type", "date", "tags", "description"]:
        if key in fm:
            lines.append(f"{key}: {fm[key]}")
    lines.append("---")
    lines.append("")
    lines.append(body)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def extract_text(body):
    text = re.sub(r"\s*-\s*\d{4}\.\d{2}\.\d{2}\s*$", "", body).strip()
    return text

def call_deepseek(prompt):
    """调用 DeepSeek API"""
    try:
        resp = requests.post(
            f"{API_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "你是一个专业的内容标引助手。只输出 JSON，不输出其他内容。"},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 4000,
            },
            timeout=60
        )
        if resp.status_code != 200:
            print(f"    API 错误: HTTP {resp.status_code}: {resp.text[:200]}")
            return None
        
        result = resp.json()["choices"][0]["message"]["content"].strip()
        
        # 提取 JSON
        json_match = re.search(r"\[[\s\S]*\]", result)
        if json_match:
            return json.loads(json_match.group())
        return None
    except Exception as e:
        print(f"    请求异常: {e}")
        return None

# ====== 主流程 ======
def main():
    print(f"扫描微博文件 {START_SEQ} ~ {END_SEQ}...")
    
    all_items = []
    processed = 0
    skipped = 0
    
    for seq in range(START_SEQ, END_SEQ + 1):
        fm, body, path, fname = read_md(seq)
        if not path:
            continue
        
        existing_tags = fm.get("tags", "[]") if fm else "[]"
        if existing_tags != "[]":
            skipped += 1
            continue
        
        text = extract_text(body)
        if not text:
            skipped += 1
            continue
        
        all_items.append({
            "seq": seq,
            "text": text,
            "body": body,
            "path": path,
            "fname": fname,
            "fm": fm or {},
        })
        processed += 1
    
    print(f"待标引: {processed} 条, 已跳过: {skipped} 条")
    
    if processed == 0:
        print("全部已完成")
        return
    
    total_batches = (processed + BATCH_SIZE - 1) // BATCH_SIZE
    tagged_count = 0
    
    for batch_num in range(total_batches):
        start = batch_num * BATCH_SIZE
        end = min(start + BATCH_SIZE, processed)
        batch = all_items[start:end]
        
        seqs = [item["seq"] for item in batch]
        print(f"\n批次 {batch_num+1}/{total_batches}: {seqs[0]}~{seqs[-1]} ({len(batch)} 条)...")
        
        # 构造 prompt
        prompt = """你是一个全领域深度观察员。请为以下每条微博生成标签（2-4个）和摘要（80-110字）。

标签覆盖视角（不限于此）：
- 时事热点
- 心理情感
- 科技趋势
- 生活哲学
- 职场文化
- 数字生态
- AI人工智能
- 社会观察
- 读书思考
- 个人成长
- 投资经济
- 国际视野

每条微博用 === 分隔。请严格按 JSON 数组格式输出：
[{"tags": ["#标签1", "#标签2"], "description": "80-110字的摘要"}, ...]

微博内容：
"""
        for item in batch:
            prompt += f"\n=== 微博 {item['seq']} ===\n{item['text'][:2000]}\n"
        
        results = call_deepseek(prompt)
        
        if results and len(results) == len(batch):
            for item, result in zip(batch, results):
                tags = result.get("tags", [])
                tags_str = json.dumps(tags, ensure_ascii=False) if isinstance(tags, list) else "[]"
                desc = result.get("description", "")
                
                item["fm"]["tags"] = tags_str
                item["fm"]["description"] = f'"{desc}"'
                write_md(item["path"], item["fm"], item["body"])
                tagged_count += 1
            
            print(f"  ✅ 成功标引 {len(batch)} 条")
        else:
            print(f"  ⚠️ 标引返回异常 (结果: {len(results) if results else 0}, 期望: {len(batch)})")
        
        time.sleep(API_DELAY)
    
    print(f"\n{'='*50}")
    print(f"✅ 完成！成功标引 {tagged_count}/{processed} 条")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()
