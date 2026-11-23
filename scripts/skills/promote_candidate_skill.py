#!/usr/bin/env python3
"""Promote a vetted community candidate skill into verified-skills.json."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path


def compute_content_hash(item: dict) -> str:
    payload = json.dumps(
        {
            "name": item["name"],
            "site": item["site"],
            "skillCreation": item["skillCreation"],
            "helpers": item.get("helpers", []),
        },
        sort_keys=True,
        ensure_ascii=False,
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def promote_candidate(
    candidates_path: Path,
    verified_path: Path,
    *,
    fingerprint: str | None = None,
    name: str | None = None,
    title_zh: str | None = None,
    title_en: str | None = None,
    category: str = "automation",
    pro_only: bool = False,
) -> dict:
    candidates_doc = json.loads(candidates_path.read_text(encoding="utf-8"))
    verified_doc = (
        json.loads(verified_path.read_text(encoding="utf-8"))
        if verified_path.is_file()
        else {"version": 1, "updatedAt": 0, "items": []}
    )

    candidates = candidates_doc.get("items", [])
    match = None
    for entry in candidates:
        if fingerprint and entry.get("fingerprint") == fingerprint:
            match = entry
            break
        if name and entry.get("name") == name:
            match = entry
            break
    if match is None:
        raise SystemExit("No matching candidate found in community-candidates.json")

    skill_name = match["name"]
    catalog_id = skill_name.removeprefix("neo-")
    skill_desc = match.get("description", "")
    promoted = {
        "id": catalog_id,
        "name": skill_name,
        "title": {
            "zh": title_zh or skill_name,
            "en": title_en or skill_name,
        },
        "description": {
            "zh": skill_desc,
            "en": skill_desc,
        },
        "site": match.get("site", ""),
        "category": category,
        "proOnly": pro_only,
        "avgTokensSaved": int(match.get("avgTokensSaved", 0)),
        "verifiedCleanRuns": int(match.get("totalCleanRuns", 2)),
        "skillCreation": {
            "description": skill_desc,
            "site": match.get("site", ""),
            "steps": [],
            "learnedNotes": [],
            "body": match["body"],
        },
        "helpers": match.get("helpers", []),
    }
    promoted["contentHash"] = compute_content_hash(promoted)

    items = [item for item in verified_doc.get("items", []) if item.get("id") != catalog_id]
    items.append(promoted)
    verified_doc["version"] = int(verified_doc.get("version", 1))
    verified_doc["updatedAt"] = int(time.time() * 1000)
    verified_doc["items"] = items

    verified_path.parent.mkdir(parents=True, exist_ok=True)
    verified_path.write_text(
        json.dumps(verified_doc, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return promoted


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote candidate skill into verified catalog")
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--verified", type=Path, required=True)
    parser.add_argument("--fingerprint")
    parser.add_argument("--name")
    parser.add_argument("--title-zh")
    parser.add_argument("--title-en")
    parser.add_argument("--category", default="automation")
    parser.add_argument("--pro-only", action="store_true")
    args = parser.parse_args()

    if not args.fingerprint and not args.name:
        raise SystemExit("Provide either --fingerprint or --name")

    promoted = promote_candidate(
        args.candidates,
        args.verified,
        fingerprint=args.fingerprint,
        name=args.name,
        title_zh=args.title_zh,
        title_en=args.title_en,
        category=args.category,
        pro_only=args.pro_only,
    )
    print(f"Promoted {promoted['name']} ({promoted['contentHash']}) -> {args.verified}")


if __name__ == "__main__":
    main()
