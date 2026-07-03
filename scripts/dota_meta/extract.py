from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .config import PATCH_VERSION, RAW_DIR, all_sample_league_ids, event_group_for_league
from .db import connect


def write_jsonl(path: Path, rows: Iterable[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
            count += 1
    return count


def fetch_rows(database: str, sql: str, params: tuple = ()) -> list[dict]:
    with connect(database) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return list(cur.fetchall())


def extract_match_overview() -> list[dict]:
    league_ids = all_sample_league_ids()
    placeholders = ",".join(["%s"] * len(league_ids))
    sql = f"""
        select match_id, patch_version, league_id, league_name, start_date, end_date,
               team_name_1, team_name_2, duration, win_status
        from dwd_match_overview
        where patch_version = %s
          and league_id in ({placeholders})
        order by start_date, match_id
    """
    rows = fetch_rows("dwd_dota2", sql, (PATCH_VERSION, *league_ids))
    for row in rows:
        row["event_group"] = event_group_for_league(int(row["league_id"]))
    return rows


def extract_by_match_ids(table: str, columns: list[str], match_ids: list[int], database: str) -> list[dict]:
    if not match_ids:
        return []
    output: list[dict] = []
    column_sql = ", ".join(columns)
    for start in range(0, len(match_ids), 250):
        chunk = match_ids[start : start + 250]
        placeholders = ",".join(["%s"] * len(chunk))
        sql = f"select {column_sql} from {table} where cast(match_id as bigint) in ({placeholders})"
        output.extend(fetch_rows(database, sql, tuple(chunk)))
    return output


def run_extraction() -> dict[str, int]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    overview = extract_match_overview()
    match_ids = [int(row["match_id"]) for row in overview]
    counts = {
        "match_overview": write_jsonl(RAW_DIR / "match_overview.jsonl", overview),
        "match_picks_bans": write_jsonl(
            RAW_DIR / "match_picks_bans.jsonl",
            extract_by_match_ids(
                "match_picks_bans",
                ["match_id", "ord", "is_pick", "team", "hero_id", "hero_name_cn", "hero_name_en"],
                match_ids,
                "dota2_analysis",
            ),
        ),
        "players": write_jsonl(
            RAW_DIR / "players.jsonl",
            extract_by_match_ids(
                "players",
                ["match_id", "slot", "steamid", "hero_id", "hero_name", "persona", "team", "win"],
                match_ids,
                "dota2_analysis",
            ),
        ),
        "match_league_position": write_jsonl(
            RAW_DIR / "match_league_position.jsonl",
            extract_by_match_ids(
                "dwd_match_league_position",
                [
                    "league_id",
                    "match_id",
                    "steamid",
                    "hero_id",
                    "hero_name",
                    "position",
                    "team_id",
                    "team_tag",
                    "is_radiant",
                ],
                match_ids,
                "dwd_dota2",
            ),
        ),
        "match_player_positions": write_jsonl(
            RAW_DIR / "match_player_positions.jsonl",
            extract_by_match_ids(
                "dwd_match_player_positions",
                ["match_id", "account_id", "steamid", "name", "team", "lane_role", "hits_5m"],
                match_ids,
                "dwd_dota2",
            ),
        ),
    }
    heroes = fetch_rows(
        "dwd_dota2",
        """
        select hero_id, hero_name_en1, hero_name_en2, hero_name, hero_name_cn, hero_name_cn2
        from dim_dota2_heroes2
        """,
    )
    counts["heroes"] = write_jsonl(RAW_DIR / "heroes.jsonl", heroes)
    return counts
