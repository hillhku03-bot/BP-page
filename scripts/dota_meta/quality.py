from __future__ import annotations

import json
from collections import Counter
from typing import Any

import pandas as pd

from .config import CALCULATION_VERSION, PATCH_VERSION, PUBLIC_DATA_DIR, REPORT_DIR


def _match_ids(frame: pd.DataFrame) -> set[int]:
    if frame.empty or "match_id" not in frame:
        return set()
    values = pd.to_numeric(frame["match_id"], errors="coerce").dropna().astype("int64")
    return set(values.tolist())


def _row_counts_by_match(frame: pd.DataFrame) -> dict[int, int]:
    if frame.empty or "match_id" not in frame:
        return {}
    prepared = frame.copy()
    prepared["match_id_int"] = pd.to_numeric(prepared["match_id"], errors="coerce")
    prepared = prepared.dropna(subset=["match_id_int"]).copy()
    prepared["match_id_int"] = prepared["match_id_int"].astype("int64")
    return {int(match_id): int(count) for match_id, count in prepared.groupby("match_id_int").size().to_dict().items()}


def _int_series(values: pd.Series) -> pd.Series:
    return pd.to_numeric(values, errors="coerce").astype("Int64")


def _confirmed_position_counts_by_match(
    matches: pd.DataFrame,
    players: pd.DataFrame,
    league_pos: pd.DataFrame,
    roster_pos: pd.DataFrame | None,
) -> dict[int, int]:
    confirmed_keys: set[tuple[int, int]] = set()
    if not league_pos.empty and {"match_id", "steamid"}.issubset(league_pos.columns):
        prepared = league_pos.copy()
        prepared["match_id_int"] = _int_series(prepared["match_id"])
        prepared["steamid_int"] = _int_series(prepared["steamid"])
        prepared = prepared.dropna(subset=["match_id_int", "steamid_int"]).copy()
        confirmed_keys.update(
            (int(row["match_id_int"]), int(row["steamid_int"])) for row in prepared.to_dict("records")
        )

    if (
        roster_pos is not None
        and not roster_pos.empty
        and not matches.empty
        and not players.empty
        and {"league_id", "steamid", "position"}.issubset(roster_pos.columns)
    ):
        match_context = matches.copy()
        match_context["match_id_int"] = _int_series(match_context["match_id"])
        match_context["league_id_int"] = _int_series(match_context["league_id"]) if "league_id" in match_context else pd.NA
        match_context = match_context.dropna(subset=["match_id_int", "league_id_int"]).copy()
        player_context = players.copy()
        player_context["match_id_int"] = _int_series(player_context["match_id"])
        player_context["steamid_int"] = _int_series(player_context["steamid"]) if "steamid" in player_context else pd.NA
        player_context = player_context.dropna(subset=["match_id_int", "steamid_int"]).copy()
        roster = roster_pos.copy()
        roster["league_id_int"] = _int_series(roster["league_id"])
        roster["steamid_int"] = _int_series(roster["steamid"])
        roster["position"] = _int_series(roster["position"])
        roster = roster.dropna(subset=["league_id_int", "steamid_int", "position"]).copy()
        for column in ["league_id_int", "steamid_int", "position"]:
            roster[column] = roster[column].astype("int64")
        roster = roster[roster["position"].between(1, 5)].copy()
        position_counts = (
            roster.groupby(["league_id_int", "steamid_int"])["position"]
            .nunique()
            .reset_index(name="position_count")
        )
        roster = roster.merge(position_counts, on=["league_id_int", "steamid_int"], how="left")
        roster = roster[roster["position_count"].eq(1)][["league_id_int", "steamid_int"]].drop_duplicates()
        roster_matches = player_context.merge(
            match_context[["match_id_int", "league_id_int"]],
            on="match_id_int",
            how="inner",
        ).merge(roster, on=["league_id_int", "steamid_int"], how="inner")
        confirmed_keys.update(
            (int(row["match_id_int"]), int(row["steamid_int"])) for row in roster_matches.to_dict("records")
        )

    counts: Counter[int] = Counter()
    for match_id, _steamid in confirmed_keys:
        counts[match_id] += 1
    return dict(counts)


def _event_match_map(matches: pd.DataFrame) -> dict[str, list[int]]:
    if matches.empty:
        return {}
    prepared = matches.copy()
    prepared["match_id_int"] = pd.to_numeric(prepared["match_id"], errors="coerce")
    prepared = prepared.dropna(subset=["match_id_int"]).copy()
    prepared["match_id_int"] = prepared["match_id_int"].astype("int64")
    return {
        str(event): sorted(group["match_id_int"].dropna().astype("int64").unique().tolist())
        for event, group in prepared.groupby("event_group")
    }


def _rate(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 4) if denominator else 0.0


def validate_raw_coverage(
    matches: pd.DataFrame,
    bp: pd.DataFrame,
    players: pd.DataFrame,
    league_pos: pd.DataFrame,
    raw_pos: pd.DataFrame | None = None,
    roster_pos: pd.DataFrame | None = None,
) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    match_ids = sorted(_match_ids(matches))
    bp_counts = _row_counts_by_match(bp)
    player_counts = _row_counts_by_match(players)
    confirmed_pos_counts = _confirmed_position_counts_by_match(matches, players, league_pos, roster_pos)
    raw_pos_counts = _row_counts_by_match(raw_pos if raw_pos is not None else pd.DataFrame())

    for match_id in match_ids:
        bp_count = int(bp_counts.get(match_id, 0))
        if bp_count != 24:
            issues.append({"match_id": match_id, "issue_type": "bp_row_count_not_24", "actual": bp_count, "expected": 24})

        player_count = int(player_counts.get(match_id, 0))
        if player_count != 10:
            issues.append(
                {"match_id": match_id, "issue_type": "player_row_count_not_10", "actual": player_count, "expected": 10}
            )

        confirmed_count = int(confirmed_pos_counts.get(match_id, 0))
        if confirmed_count not in (0, 10):
            issues.append(
                {
                    "match_id": match_id,
                    "issue_type": "confirmed_position_row_count_not_10",
                    "actual": confirmed_count,
                    "expected": 10,
                }
            )

        raw_count = int(raw_pos_counts.get(match_id, 0))
        if raw_pos is not None and raw_count not in (0, 10):
            issues.append(
                {"match_id": match_id, "issue_type": "raw_position_row_count_not_10", "actual": raw_count, "expected": 10}
            )

    event_details = []
    for event_group, event_match_ids in _event_match_map(matches).items():
        event_issue_count = sum(1 for issue in issues if int(issue["match_id"]) in set(event_match_ids))
        event_details.append(
            {
                "event_group": event_group,
                "match_count": len(event_match_ids),
                "bp_complete_matches": sum(1 for match_id in event_match_ids if bp_counts.get(match_id, 0) == 24),
                "player_complete_matches": sum(1 for match_id in event_match_ids if player_counts.get(match_id, 0) == 10),
                "confirmed_position_complete_matches": sum(
                    1 for match_id in event_match_ids if confirmed_pos_counts.get(match_id, 0) == 10
                ),
                "raw_position_complete_matches": sum(1 for match_id in event_match_ids if raw_pos_counts.get(match_id, 0) == 10),
                "issue_count": event_issue_count,
            }
        )
    for event in event_details:
        event["bp_complete_rate"] = _rate(event["bp_complete_matches"], event["match_count"])
        event["player_complete_rate"] = _rate(event["player_complete_matches"], event["match_count"])
        event["confirmed_position_complete_rate"] = _rate(event["confirmed_position_complete_matches"], event["match_count"])
        event["raw_position_complete_rate"] = _rate(event["raw_position_complete_matches"], event["match_count"])

    issue_summary = dict(Counter(issue["issue_type"] for issue in issues))
    return {
        "patch_version": PATCH_VERSION,
        "calculation_version": CALCULATION_VERSION,
        "totals": {
            "matches": len(match_ids),
            "bp_matches": len(bp_counts),
            "player_matches": len(player_counts),
            "confirmed_position_matches": sum(1 for count in confirmed_pos_counts.values() if count == 10),
            "raw_position_matches": sum(1 for count in raw_pos_counts.values() if count == 10),
            "issue_count": len(issues),
        },
        "event_match_counts": {
            event["event_group"]: event["match_count"]
            for event in sorted(event_details, key=lambda item: item["event_group"])
        },
        "event_quality": sorted(event_details, key=lambda item: item["event_group"]),
        "issue_summary": issue_summary,
        "issues": issues,
    }


def write_quality_report(report: dict[str, Any]) -> None:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    (PUBLIC_DATA_DIR / "data_quality.json").write_text(text, encoding="utf-8")
    (REPORT_DIR / "data_quality_report.json").write_text(text, encoding="utf-8")
