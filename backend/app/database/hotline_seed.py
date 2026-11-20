"""导入官方售后电话目录：只在表为空时写入，避免覆盖人工审核后的线上数据。"""
import json
from functools import lru_cache
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.hotline import HotlineDirectory

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def seed_hotline_directory(db: Session) -> None:
    """首次启动写入 hotlines.json 全部记录（含暂停推荐的记录）。"""
    if db.scalar(select(func.count()).select_from(HotlineDirectory)) > 0:
        return

    payload = json.loads(
        (DATA_DIR / "hotlines.json").read_text(encoding="utf-8")
    )
    for row in payload["records"]:
        db.add(
            HotlineDirectory(
                id=row["id"],
                brand_id=row["brand_id"],
                brand=row["brand"],
                brand_group=row["brand_group"],
                aliases=json.dumps(row.get("aliases") or [], ensure_ascii=False),
                phone=row["phone"],
                phone_uri=row["phone_uri"],
                region=row.get("region"),
                categories=json.dumps(
                    row.get("categories") or [], ensure_ascii=False
                ),
                category_mapping_basis=row.get("category_mapping_basis"),
                source_url=row.get("source_url"),
                source_type=row.get("source_type"),
                web_status=row.get("web_status") or "",
                web_checked_on=row.get("web_checked_on") or "",
                phone_test_status=row.get("phone_test_status") or "not_tested",
                phone_tested_at=row.get("phone_tested_at"),
                hours=row.get("hours"),
                notes=row.get("notes"),
                next_review_on=row.get("next_review_on") or "",
                display_enabled=bool(row.get("display_enabled")),
                evidence_level=row.get("evidence_level"),
            )
        )
    db.commit()


@lru_cache(maxsize=1)
def directory_meta() -> dict:
    """资料日期、适用区域与核验限制；随数据包一起部署。"""
    payload = json.loads(
        (DATA_DIR / "hotlines.json").read_text(encoding="utf-8")
    )
    return {
        "as_of": payload.get("as_of"),
        "region": payload.get("region"),
        "verification_limit": payload.get("verification_limit"),
    }


@lru_cache(maxsize=1)
def review_brands() -> list[dict]:
    """待复核品牌（只返回品牌与原因，不带候选号码，避免被当作可拨号推荐）。"""
    payload = json.loads(
        (DATA_DIR / "review-queue.json").read_text(encoding="utf-8")
    )
    return [
        {"brand": item.get("brand"), "reason": item.get("reason")}
        for item in payload.get("items", [])
        if item.get("brand")
    ]
