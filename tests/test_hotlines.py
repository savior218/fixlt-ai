def test_hotlines_public_directory(client) -> None:
    resp = client.get("/api/hotlines")
    assert resp.status_code == 200
    body = resp.json()

    assert body["as_of"] == "2026-11-20"
    assert body["region"] == "中国大陆"
    records = body["records"]
    assert len(records) == 58
    assert all(r["display_enabled"] is True for r in records)
    assert all(r["web_status"] == "official_page_listed" for r in records)
    assert all(r["phone_test_status"] == "not_tested" for r in records)
    assert all(r["status_label"].endswith("未拨测") for r in records)
    assert all(r["phone_uri"].startswith("tel:") for r in records)

    groups = {r["brand_group"] for r in records}
    assert "东芝" in groups
    assert len([r for r in records if r["brand_group"] == "东芝"]) == 2
    assert "小米" not in groups

    # 暂停推荐的候选只保留品牌与原因，不向前台提供候选号码
    pending = {item["brand"] for item in body["review_brands"]}
    assert "小米" in pending
    assert len(pending) >= 1
