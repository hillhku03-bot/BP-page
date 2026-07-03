import json

from scripts.dota_meta.db import masked_db_url
from scripts.dota_meta.extract import write_jsonl


def test_masked_db_url_hides_password(monkeypatch):
    monkeypatch.setenv("DOTA_LOCAL_DB_URL", "mysql://dota_user:secret@127.0.0.1:9030/dwd_dota2")

    masked = masked_db_url()

    assert masked == "mysql://dota_user:***@127.0.0.1:9030/dwd_dota2"
    assert "secret" not in masked


def test_write_jsonl_preserves_utf8_records(tmp_path):
    path = tmp_path / "sample.jsonl"

    count = write_jsonl(path, [{"hero_id": 1, "hero_name_cn": "敌法师"}])

    assert count == 1
    assert json.loads(path.read_text(encoding="utf-8")) == {
        "hero_id": 1,
        "hero_name_cn": "敌法师",
    }
