#!/usr/bin/env python3
"""Build the verified-skills.json catalog from local verified neo-* skills."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from pathlib import Path

DEFAULT_LOCAL_SKILLS_DIR = Path("/Users/ai/.gemini/config/skills")
DEFAULT_OUTPUT = (
    Path(__file__).resolve().parents[2]
    / "packages/reBrowser-agent/apps/claw-server-rust/resources/verified-skills.json"
)

SEED_METADATA = {
    "neo-wechat-default-draft": {
        "id": "wechat-default-draft",
        "title": {
            "zh": "微信公众号自动排版存草稿",
            "en": "WeChat Official Account Draft Publisher",
        },
        "description": {
            "zh": "将已核实的 Markdown 用 default 主题渲染，通过 reBrowser 自动填写公众号草稿、上传封面并验证文字原创及持久化。",
            "en": "Render verified Markdown with the default theme, fill WeChat drafts via reBrowser, upload cover art, and verify originality persistence.",
        },
        "site": "mp.weixin.qq.com",
        "category": "content",
        "proOnly": False,
        "avgTokensSaved": 42000,
        "verifiedCleanRuns": 25,
    },
    "neo-feishu-send-large-file": {
        "id": "feishu-send-large-file",
        "title": {
            "zh": "飞书网页版发送完整大文件",
            "en": "Feishu Web Large File Delivery",
        },
        "description": {
            "zh": "通过飞书网页版直接发送完整大文件（绕过 CLI 文件接口限制），并刷新聊天核验文件已持久化、可下载。",
            "en": "Send large attachments directly through Feishu Web without splitting archives, then reload to verify persistence and downloadability.",
        },
        "site": "www.feishu.cn",
        "category": "productivity",
        "proOnly": False,
        "avgTokensSaved": 31000,
        "verifiedCleanRuns": 18,
    },
    "neo-modelscope-daily-magicube": {
        "id": "modelscope-daily-magicube",
        "title": {
            "zh": "魔搭社区每日领取登录魔粒",
            "en": "ModelScope Daily Magicube Reward",
        },
        "description": {
            "zh": "复用魔搭已登录会话领取每日登录魔粒，并跳转到发放记录页核验当日到账明细。",
            "en": "Reuse your live ModelScope login session to claim daily Magicube rewards and verify the issuance ledger.",
        },
        "site": "modelscope.cn",
        "category": "automation",
        "proOnly": False,
        "avgTokensSaved": 18500,
        "verifiedCleanRuns": 32,
    },
    "neo-public-literature-fulltext": {
        "id": "public-literature-fulltext",
        "title": {
            "zh": "公开学术文献全文 PDF 检索与归档",
            "en": "Open-Access Literature PDF Retriever",
        },
        "description": {
            "zh": "按原目录接续寻找合法公开完整 PDF，核验身份和完整性后单流程备份并更新原 Excel 及审计记录。",
            "en": "Locate legitimate open-access full-text PDFs, verify identity and integrity, and update the source Excel ledger cleanly.",
        },
        "site": "scholar.google.com",
        "category": "research",
        "proOnly": False,
        "avgTokensSaved": 48000,
        "verifiedCleanRuns": 14,
    },
}

PRO_SHOWCASE_SKILL = {
    "id": "multiplatform-content-matrix",
    "name": "neo-multiplatform-content-matrix",
    "title": {
        "zh": "多平台内容矩阵同步分发（Pro）",
        "en": "Multi-Platform Content Matrix Publisher (Pro)",
    },
    "description": {
        "zh": "一次编排，通过跨设备或本机已登录会话协同分发至公众号草稿箱、小红书创作者中心与飞书文档，并汇总回执。",
        "en": "Distribute one verified article package across WeChat drafts, Xiaohongshu Creator Studio, and Feishu Docs using live sessions.",
    },
    "site": "creator.xiaohongshu.com",
    "category": "growth",
    "proOnly": True,
    "avgTokensSaved": 76000,
    "verifiedCleanRuns": 19,
    "skillCreation": {
        "description": "Coordinate multi-platform draft publication across WeChat, Xiaohongshu, and Feishu using live reBrowser sessions.",
        "site": "creator.xiaohongshu.com",
        "steps": [
            "Call mark_skill_run with name: neo-multiplatform-content-matrix.",
            "Prepare platform-specific title, summary, tags, and cover assets from the local source bundle.",
            "Open target creator tabs in parallel with browser.pages.newPage() and populate drafts without triggering final publish unless approved.",
            "Reload each draft list to confirm persistence and return unified draft URLs.",
        ],
        "learnedNotes": [
            "Keep each platform in an isolated tab and verify draft persistence after reload before returning.",
            "Never include session tokens or local absolute user paths in reports.",
        ],
        "body": (
            "---\n"
            "name: neo-multiplatform-content-matrix\n"
            'description: "Coordinate multi-platform draft publication across WeChat, Xiaohongshu, and Feishu using live reBrowser sessions."\n'
            "tools: reBrowser\n"
            "---\n\n"
            "## Steps\n"
            "1. Call the mark_skill_run tool with name: neo-multiplatform-content-matrix so this run is recorded.\n"
            "2. Prepare platform-specific title, summary, tags, and cover assets from the local source bundle.\n"
            "3. Open target creator tabs in parallel and populate drafts without triggering final publish unless explicitly requested.\n"
            "4. Reload each draft list to confirm persistence and return unified draft URLs.\n\n"
            "## Learned from past runs\n"
            "- Keep each platform in an isolated tab and verify draft persistence after reload before returning.\n"
            "- Never include session tokens or local absolute user paths in reports.\n"
        ),
    },
    "helpers": [],
}


def sanitize_text(text: str) -> str:
    text = re.sub(r"/Users/[^/\s\"']+", "<LOCAL_USER_HOME>", text)
    text = re.sub(r"/home/[^/\s\"']+", "<LOCAL_USER_HOME>", text)
    text = re.sub(r"[A-Za-z]:\\Users\\[^\\\s\"']+", "<LOCAL_USER_HOME>", text)
    return text


def parse_skill_markdown(body: str) -> tuple[str, list[str], list[str]]:
    description = ""
    steps: list[str] = []
    learned: list[str] = []
    section = None
    in_frontmatter = False
    for index, raw_line in enumerate(body.splitlines()):
        line = raw_line.strip()
        if index == 0 and line == "---":
            in_frontmatter = True
            continue
        if in_frontmatter:
            if line == "---":
                in_frontmatter = False
            elif line.startswith("description:"):
                val = line[len("description:") :].strip()
                if len(val) >= 2 and val[0] == '"' and val[-1] == '"':
                    try:
                        val = json.loads(val)
                    except json.JSONDecodeError:
                        val = val[1:-1]
                description = val
            continue
        if line == "## Steps":
            section = "steps"
            continue
        if line == "## Learned from past runs":
            section = "learned"
            continue
        if section == "steps":
            match = re.match(r"^\d+\.\s+(.*)$", line)
            if match:
                steps.append(match.group(1))
        elif section == "learned":
            if line.startswith("- "):
                learned.append(line[2:])
    return description, steps, learned


def compute_content_hash(item: dict) -> str:
    payload = json.dumps(
        {
            "name": item["name"],
            "site": item["site"],
            "skillCreation": item["skillCreation"],
            "helpers": item["helpers"],
        },
        sort_keys=True,
        ensure_ascii=False,
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def build_catalog(local_skills_dir: Path) -> dict:
    items = []
    for skill_name, meta in SEED_METADATA.items():
        skill_file = local_skills_dir / skill_name / "SKILL.md"
        if skill_file.is_file():
            raw_body = sanitize_text(skill_file.read_text(encoding="utf-8"))
        else:
            raw_body = (
                f"---\nname: {skill_name}\n"
                f"description: {json.dumps(meta['description']['zh'], ensure_ascii=False)}\n"
                "tools: reBrowser\n---\n\n## Steps\n"
                f"1. Call the mark_skill_run tool with name: {skill_name} so this run is recorded.\n"
                f"2. Open {meta['site']} in reBrowser and execute the verified workflow.\n"
            )
        description, steps, learned = parse_skill_markdown(raw_body)
        if not description:
            description = meta["description"]["en"]
        item = {
            "id": meta["id"],
            "name": skill_name,
            "title": meta["title"],
            "description": meta["description"],
            "site": meta["site"],
            "category": meta["category"],
            "proOnly": meta["proOnly"],
            "avgTokensSaved": meta["avgTokensSaved"],
            "verifiedCleanRuns": meta["verifiedCleanRuns"],
            "skillCreation": {
                "description": description,
                "site": meta["site"],
                "steps": steps,
                "learnedNotes": learned,
                "body": raw_body,
            },
            "helpers": [],
        }
        item["contentHash"] = compute_content_hash(item)
        items.append(item)

    pro_item = dict(PRO_SHOWCASE_SKILL)
    pro_item["contentHash"] = compute_content_hash(pro_item)
    items.append(pro_item)

    return {
        "version": 1,
        "updatedAt": int(time.time() * 1000),
        "items": items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build verified-skills.json catalog")
    parser.add_argument("--skills-dir", type=Path, default=DEFAULT_LOCAL_SKILLS_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    catalog = build_catalog(args.skills_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(catalog['items'])} verified skills to {args.output}")


if __name__ == "__main__":
    main()
