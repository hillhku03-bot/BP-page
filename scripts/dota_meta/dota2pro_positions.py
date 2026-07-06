from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.request import urlopen

import pandas as pd

from .config import CALCULATION_VERSION, LEAGUE_ID_TO_EVENT_GROUP, PATCH_VERSION, PROJECT_ROOT, PUBLIC_DATA_DIR
from .db import connect


DOTA2PRO_IDS_EXPORT_URL = "http://8.140.222.233/dota2pro/api/export?scope=all&tier=all&format=ids"
WORK_DIR = PROJECT_ROOT / "work" / "dota2pro_position_backfill"
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "dota2pro_position_backfill"


def _int_series(values: pd.Series) -> pd.Series:
    return pd.to_numeric(values, errors="coerce").astype("Int64")


def _position_series(values: pd.Series) -> pd.Series:
    digits = values.astype(str).str.extract(r"([1-5])", expand=False)
    return pd.to_numeric(digits, errors="coerce").astype("Int64")


def normalize_dota2pro_roster(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame(columns=["league_id", "steamid", "position"])

    steamid_column = "steamid64" if "steamid64" in frame else "steamid"
    position_column = "position" if "position" in frame else "位置"
    roster = frame.copy()
    roster["league_id"] = _int_series(roster["league_id"])
    roster["steamid"] = _int_series(roster[steamid_column])
    roster["position"] = _position_series(roster[position_column])
    roster = roster.dropna(subset=["league_id", "steamid", "position"]).copy()
    for column in ["league_id", "steamid", "position"]:
        roster[column] = roster[column].astype("int64")

    position_counts = (
        roster.groupby(["league_id", "steamid"])["position"]
        .nunique()
        .reset_index(name="position_count")
    )
    roster = roster.merge(position_counts, on=["league_id", "steamid"], how="left")
    roster = roster[roster["position_count"].eq(1)].copy()
    return roster[["league_id", "steamid", "position"]].drop_duplicates().reset_index(drop=True)


def _normalize_matches(matches: pd.DataFrame) -> pd.DataFrame:
    if matches.empty:
        return pd.DataFrame(columns=["match_id", "event_group", "league_id"])
    output = matches.copy()
    output["match_id"] = _int_series(output["match_id"])
    output["league_id"] = _int_series(output["league_id"])
    output = output.dropna(subset=["match_id", "league_id"]).copy()
    for column in ["match_id", "league_id"]:
        output[column] = output[column].astype("int64")
    return output


def _normalize_players(players: pd.DataFrame) -> pd.DataFrame:
    if players.empty:
        return pd.DataFrame(columns=["match_id", "steamid", "hero_id", "team", "persona"])
    output = players.copy()
    output["match_id"] = _int_series(output["match_id"])
    output["steamid"] = _int_series(output["steamid"])
    output["hero_id"] = _int_series(output["hero_id"])
    output["team"] = _int_series(output["team"]) if "team" in output else pd.NA
    output = output.dropna(subset=["match_id", "steamid", "hero_id"]).copy()
    for column in ["match_id", "steamid", "hero_id"]:
        output[column] = output[column].astype("int64")
    output["team"] = output["team"].astype("Int64")
    if "persona" not in output:
        output["persona"] = ""
    return output


def build_confirmed_position_metrics_from_roster(
    matches: pd.DataFrame,
    players: pd.DataFrame,
    roster: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    matches_norm = _normalize_matches(matches)
    players_norm = _normalize_players(players)
    roster_norm = normalize_dota2pro_roster(roster)
    if matches_norm.empty or players_norm.empty or roster_norm.empty:
        return (
            pd.DataFrame(
                columns=[
                    "patch_version",
                    "event_group",
                    "hero_id",
                    "position",
                    "position_pick_count",
                    "match_count",
                    "position_pick_rate",
                    "confidence_flag",
                    "confirmed_count",
                    "derived_count",
                    "calculation_version",
                ]
            ),
            pd.DataFrame(columns=["event_group", "league_id", "match_id", "steamid", "persona", "hero_id", "team"]),
        )

    player_context = players_norm.merge(matches_norm[["match_id", "event_group", "league_id"]], on="match_id", how="inner")
    joined = player_context.merge(roster_norm, on=["league_id", "steamid"], how="left")
    missing = joined[joined["position"].isna()][
        ["event_group", "league_id", "match_id", "steamid", "persona", "hero_id", "team"]
    ].copy()
    matched = joined.dropna(subset=["position"]).copy()
    if matched.empty:
        metrics = pd.DataFrame(
            columns=[
                "patch_version",
                "event_group",
                "hero_id",
                "position",
                "position_pick_count",
                "match_count",
                "position_pick_rate",
                "confidence_flag",
                "confirmed_count",
                "derived_count",
                "calculation_version",
            ]
        )
        return metrics, missing.reset_index(drop=True)

    matched["position"] = matched["position"].astype(int)
    match_counts = (
        matches_norm.groupby("event_group", as_index=False)["match_id"]
        .nunique()
        .rename(columns={"match_id": "match_count"})
    )
    metrics = (
        matched.groupby(["event_group", "hero_id", "position"], as_index=False)
        .agg(position_pick_count=("match_id", "nunique"))
        .merge(match_counts, on="event_group", how="left")
    )
    metrics["position_pick_rate"] = metrics["position_pick_count"] / metrics["match_count"].replace({0: pd.NA})
    metrics["confidence_flag"] = "confirmed"
    metrics["confirmed_count"] = metrics["position_pick_count"]
    metrics["derived_count"] = 0
    metrics["patch_version"] = PATCH_VERSION
    metrics["calculation_version"] = CALCULATION_VERSION
    ordered_columns = [
        "patch_version",
        "event_group",
        "hero_id",
        "position",
        "position_pick_count",
        "match_count",
        "position_pick_rate",
        "confidence_flag",
        "confirmed_count",
        "derived_count",
        "calculation_version",
    ]
    return (
        metrics[ordered_columns]
        .sort_values(["event_group", "position", "position_pick_count"], ascending=[True, True, False])
        .reset_index(drop=True),
        missing.sort_values(["event_group", "match_id", "team", "steamid"]).reset_index(drop=True),
    )


def position_complete_matches(matches: pd.DataFrame, players: pd.DataFrame, roster: pd.DataFrame) -> dict[str, int]:
    matches_norm = _normalize_matches(matches)
    players_norm = _normalize_players(players)
    roster_norm = normalize_dota2pro_roster(roster)
    if matches_norm.empty or players_norm.empty or roster_norm.empty:
        return {}
    player_context = players_norm.merge(matches_norm[["match_id", "event_group", "league_id"]], on="match_id", how="inner")
    joined = player_context.merge(roster_norm, on=["league_id", "steamid"], how="left")
    complete_by_match = (
        joined.groupby(["event_group", "match_id"], as_index=False)
        .agg(player_rows=("steamid", "count"), positioned_rows=("position", lambda values: int(values.notna().sum())))
    )
    complete_by_match = complete_by_match[
        complete_by_match["player_rows"].eq(10) & complete_by_match["positioned_rows"].eq(10)
    ]
    return {
        str(event_group): int(count)
        for event_group, count in complete_by_match.groupby("event_group")["match_id"].nunique().to_dict().items()
    }


def read_dota2pro_roster(url: str = DOTA2PRO_IDS_EXPORT_URL, cache_path: Path | None = None) -> pd.DataFrame:
    if cache_path is None:
        cache_path = WORK_DIR / "dota2pro-export-ids.csv"
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(url, timeout=30) as response:
        cache_path.write_bytes(response.read())
    return normalize_dota2pro_roster(pd.read_csv(cache_path))


def fetch_sample_matches(league_ids: list[int]) -> pd.DataFrame:
    if not league_ids:
        return pd.DataFrame()
    placeholders = ",".join(["%s"] * len(league_ids))
    sql = f"""
        select match_id, league_id, start_date, team_name_1, team_name_2
        from dwd_match_overview
        where patch_version = %s
          and league_id in ({placeholders})
        order by start_date, match_id
    """
    with connect("dwd_dota2") as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (PATCH_VERSION, *league_ids))
            rows = list(cur.fetchall())
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    frame["event_group"] = frame["league_id"].map(lambda league_id: LEAGUE_ID_TO_EVENT_GROUP[int(league_id)])
    return frame


def fetch_players_for_matches(match_ids: list[int]) -> pd.DataFrame:
    if not match_ids:
        return pd.DataFrame()
    rows: list[dict[str, Any]] = []
    with connect("dota2_analysis") as conn:
        with conn.cursor() as cur:
            for start in range(0, len(match_ids), 250):
                chunk = match_ids[start : start + 250]
                placeholders = ",".join(["%s"] * len(chunk))
                sql = f"""
                    select match_id, steamid, hero_id, persona, team
                    from players
                    where cast(match_id as bigint) in ({placeholders})
                """
                cur.execute(sql, tuple(chunk))
                rows.extend(cur.fetchall())
    return pd.DataFrame(rows)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(value, ensure_ascii=False, indent=2))


def event_groups_with_incomplete_positions(data_quality: dict[str, Any], roster: pd.DataFrame) -> list[str]:
    roster_leagues = set(roster["league_id"].astype(int).tolist())
    groups = []
    for event in data_quality.get("event_quality", []):
        event_group = str(event["event_group"])
        league_ids = [league_id for league_id, group in LEAGUE_ID_TO_EVENT_GROUP.items() if group == event_group]
        if event.get("confirmed_position_complete_rate", 0) < 1 and any(league_id in roster_leagues for league_id in league_ids):
            groups.append(event_group)
    return groups


def merge_position_metrics(existing: pd.DataFrame, supplement: pd.DataFrame, event_groups: list[str]) -> pd.DataFrame:
    existing_kept = existing[~existing["event_group"].isin(event_groups)].copy()
    merged = pd.concat([existing_kept, supplement], ignore_index=True)
    return merged.sort_values(["event_group", "position", "position_pick_count"], ascending=[True, True, False]).reset_index(drop=True)


def update_quality_report(data_quality: dict[str, Any], complete_counts: dict[str, int]) -> dict[str, Any]:
    updated = json.loads(json.dumps(data_quality, ensure_ascii=False))
    for event in updated.get("event_quality", []):
        event_group = str(event["event_group"])
        if event_group not in complete_counts:
            continue
        complete = int(complete_counts[event_group])
        event["confirmed_position_complete_matches"] = complete
        event["confirmed_position_complete_rate"] = round(complete / event["match_count"], 4) if event["match_count"] else 0.0
    updated["totals"]["confirmed_position_matches"] = sum(
        int(event["confirmed_position_complete_matches"]) for event in updated.get("event_quality", [])
    )
    return updated


def write_missing_excel(missing: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    output = missing.copy()
    output["manual_position"] = ""
    output.to_excel(path, index=False)


def run_dota2pro_position_backfill() -> dict[str, Any]:
    roster = read_dota2pro_roster()
    data_quality = load_json(PUBLIC_DATA_DIR / "data_quality.json")
    target_event_groups = event_groups_with_incomplete_positions(data_quality, roster)
    target_league_ids = [
        league_id for league_id, event_group in LEAGUE_ID_TO_EVENT_GROUP.items() if event_group in set(target_event_groups)
    ]
    matches = fetch_sample_matches(target_league_ids)
    players = fetch_players_for_matches(_normalize_matches(matches)["match_id"].astype(int).tolist())

    metrics, missing = build_confirmed_position_metrics_from_roster(matches, players, roster)
    existing_metrics = pd.read_json(PUBLIC_DATA_DIR / "hero_position_metrics.json")
    merged_metrics = merge_position_metrics(existing_metrics, metrics, target_event_groups)
    write_json(PUBLIC_DATA_DIR / "hero_position_metrics.json", json.loads(merged_metrics.to_json(orient="records", force_ascii=False)))

    complete_counts = position_complete_matches(matches, players, roster)
    updated_quality = update_quality_report(data_quality, complete_counts)
    write_json(PUBLIC_DATA_DIR / "data_quality.json", updated_quality)

    missing_path = OUTPUT_DIR / "dota2pro_position_missing.xlsx"
    write_missing_excel(missing, missing_path)
    summary = {
        "target_event_groups": target_event_groups,
        "target_league_ids": target_league_ids,
        "matches": int(_normalize_matches(matches)["match_id"].nunique()) if not matches.empty else 0,
        "players": int(len(players)),
        "position_metric_rows": int(len(metrics)),
        "missing_rows": int(len(missing)),
        "missing_excel": str(missing_path),
        "complete_counts": complete_counts,
    }
    write_json(OUTPUT_DIR / "dota2pro_position_backfill_summary.json", summary)
    return summary


def main() -> None:
    summary = run_dota2pro_position_backfill()
    for key, value in summary.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
