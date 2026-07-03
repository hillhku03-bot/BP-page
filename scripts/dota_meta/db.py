from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator
from urllib.parse import urlparse

import pymysql


def masked_db_url() -> str:
    raw = os.environ.get("DOTA_LOCAL_DB_URL", "")
    if not raw:
        return ""
    parsed = urlparse(raw)
    user = parsed.username or ""
    host = parsed.hostname or ""
    port = parsed.port or 9030
    db = (parsed.path or "").lstrip("/")
    return f"mysql://{user}:***@{host}:{port}/{db}"


@contextmanager
def connect(database: str) -> Iterator[pymysql.connections.Connection]:
    raw = os.environ.get("DOTA_LOCAL_DB_URL")
    if not raw:
        raise RuntimeError("DOTA_LOCAL_DB_URL is not set")
    parsed = urlparse(raw)
    conn = pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 9030,
        user=parsed.username,
        password=parsed.password,
        database=database,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        yield conn
    finally:
        conn.close()
