"""官方售后电话目录：只读公开接口，不接用户填写的号码，不代替官方更新。"""
import json
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.hotline_seed import directory_meta, review_brands
from app.database.session import get_db
from app.models.hotline import HotlineDirectory

router = APIRouter(prefix="/api/hotlines", tags=["hotlines"])


def _serialize(row: HotlineDirectory, today: str) -> dict:
    review_due = bool(row.next_review_on) and today > row.next_review_on
    return {
        "id": row.id,
        "brand_id": row.brand_id,
        "brand": row.brand,
        "brand_group": row.brand_group,
        "aliases": json.loads(row.aliases or "[]"),
        "phone": row.phone,
        "phone_uri": row.phone_uri,
        "region": row.region,
        "categories": json.loads(row.categories or "[]"),
        "category_mapping_basis": row.category_mapping_basis,
        "source_url": row.source_url,
        "source_type": row.source_type,
        "web_status": row.web_status,
        "web_checked_on": row.web_checked_on,
        "phone_test_status": row.phone_test_status,
        "phone_tested_at": row.phone_tested_at,
        "hours": row.hours,
        "notes": row.notes,
        "next_review_on": row.next_review_on,
        "display_enabled": row.display_enabled,
        "evidence_level": row.evidence_level,
        "review_due": review_due,
        "status_label": (
            "资料待复核 · 未拨测" if review_due else "官方页面公布 · 未拨测"
        ),
    }


@router.get("")
def list_hotlines(db: Session = Depends(get_db)) -> dict:
    """返回 display_enabled 且证据状态为 official_page_listed 的记录。

    待复核品牌只返回品牌名与原因，候选号码不进入前台默认拨号目录。
    """
    rows = list(
        db.scalars(
            select(HotlineDirectory)
            .where(
                HotlineDirectory.display_enabled.is_(True),
                HotlineDirectory.web_status == "official_page_listed",
            )
            .order_by(HotlineDirectory.brand_group, HotlineDirectory.id)
        )
    )
    today = date.today().isoformat()
    visible_groups = {row.brand_group for row in rows}
    pending = [
        item
        for item in review_brands()
        if item["brand"] not in visible_groups
    ]

    return {
        **directory_meta(),
        "records": [_serialize(row, today) for row in rows],
        "review_brands": pending,
    }
