from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from .config import CALCULATION_VERSION, PATCH_VERSION, PROCESSED_DIR, PUBLIC_DATA_DIR, RAW_DIR


def read_jsonl(path: Path) -> pd.DataFrame:
    rows = []
    if not path.exists():
        return pd.DataFrame()
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return pd.DataFrame(rows)


def write_json_records(path: Path, frame: pd.DataFrame) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = json.loads(frame.to_json(orient="records", force_ascii=False))
    path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def _bool_series(values: pd.Series) -> pd.Series:
    return values.astype(str).str.strip().str.lower().isin({"1", "true", "t", "yes", "y"})


def _int_series(values: pd.Series) -> pd.Series:
    return pd.to_numeric(values, errors="coerce").astype("Int64")


def _empty_columns(columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(columns=columns)


def normalize_matches(matches: pd.DataFrame) -> pd.DataFrame:
    output = matches.copy()
    if output.empty:
        return _empty_columns(["match_id", "match_id_int", "event_group"])
    output["match_id_int"] = _int_series(output["match_id"])
    output = output.dropna(subset=["match_id_int"]).copy()
    output["match_id_int"] = output["match_id_int"].astype("int64")
    return output


def tag_bp_phase(bp: pd.DataFrame) -> pd.DataFrame:
    output = bp.copy()
    ord_int = _int_series(output["ord"])
    output["bp_phase"] = "unknown"
    output.loc[ord_int.between(0, 6), "bp_phase"] = "first_ban"
    output.loc[ord_int.between(7, 8), "bp_phase"] = "first_pick"
    output.loc[ord_int.between(9, 11), "bp_phase"] = "second_ban"
    output.loc[ord_int.between(12, 17), "bp_phase"] = "second_pick"
    output.loc[ord_int.between(18, 21), "bp_phase"] = "final_ban"
    output.loc[ord_int.between(22, 23), "bp_phase"] = "final_pick"
    return output


def normalize_bp(bp: pd.DataFrame) -> pd.DataFrame:
    if bp.empty:
        return _empty_columns(["match_id_int", "hero_id", "ord_int", "is_pick_bool", "team_int", "bp_phase"])
    output = tag_bp_phase(bp.copy())
    output["match_id_int"] = _int_series(output["match_id"])
    output["hero_id"] = _int_series(output["hero_id"])
    output["ord_int"] = _int_series(output["ord"])
    output["is_pick_bool"] = _bool_series(output["is_pick"])
    output["team_int"] = _int_series(output["team"])
    output = output.dropna(subset=["match_id_int", "hero_id", "ord_int", "team_int"]).copy()
    for column in ["match_id_int", "hero_id", "ord_int", "team_int"]:
        output[column] = output[column].astype("int64")
    return output.drop_duplicates(["match_id_int", "ord_int", "team_int", "hero_id", "is_pick_bool"])


def normalize_players(players: pd.DataFrame) -> pd.DataFrame:
    if players.empty:
        return _empty_columns(["match_id_int", "steamid_int", "hero_id", "team_int", "win_bool"])
    output = players.copy()
    output["match_id_int"] = _int_series(output["match_id"])
    output["hero_id"] = _int_series(output["hero_id"])
    output["team_int"] = _int_series(output["team"])
    if "steamid" in output:
        output["steamid_int"] = _int_series(output["steamid"])
    elif "account_id" in output:
        output["steamid_int"] = _int_series(output["account_id"])
    else:
        output["steamid_int"] = pd.NA
    output["win_bool"] = _bool_series(output["win"]) if "win" in output else False
    output = output.dropna(subset=["match_id_int", "hero_id", "team_int"]).copy()
    for column in ["match_id_int", "hero_id", "team_int"]:
        output[column] = output[column].astype("int64")
    output["steamid_int"] = output["steamid_int"].astype("Int64")
    return output


def build_hero_event_metrics(matches: pd.DataFrame, bp: pd.DataFrame, players: pd.DataFrame) -> pd.DataFrame:
    matches_norm = normalize_matches(matches)
    match_counts = (
        matches_norm.groupby("event_group", as_index=False)["match_id_int"]
        .nunique()
        .rename(columns={"match_id_int": "match_count"})
    )

    bp_norm = normalize_bp(bp).merge(
        matches_norm[["match_id_int", "event_group"]],
        on="match_id_int",
        how="inner",
    )
    if bp_norm.empty:
        bp_counts = _empty_columns(["event_group", "hero_id", "pick_count", "ban_count"])
        first_counts = _empty_columns(["event_group", "hero_id", "first_ban", "first_pick"])
    else:
        bp_counts = (
            bp_norm.groupby(["event_group", "hero_id", "is_pick_bool"], as_index=False)
            .size()
            .pivot_table(index=["event_group", "hero_id"], columns="is_pick_bool", values="size", fill_value=0)
            .reset_index()
            .rename(columns={False: "ban_count", True: "pick_count"})
        )
        for column in ["pick_count", "ban_count"]:
            if column not in bp_counts:
                bp_counts[column] = 0

        first_phase = bp_norm[bp_norm["bp_phase"].isin(["first_ban", "first_pick"])]
        first_counts = (
            first_phase.groupby(["event_group", "hero_id", "bp_phase"], as_index=False)
            .size()
            .pivot_table(index=["event_group", "hero_id"], columns="bp_phase", values="size", fill_value=0)
            .reset_index()
        )
        for column in ["first_ban", "first_pick"]:
            if column not in first_counts:
                first_counts[column] = 0

    players_norm = normalize_players(players).merge(
        matches_norm[["match_id_int", "event_group"]],
        on="match_id_int",
        how="inner",
    )
    if players_norm.empty:
        wins = _empty_columns(["event_group", "hero_id", "player_pick_count", "wins"])
    else:
        wins = (
            players_norm.groupby(["event_group", "hero_id"], as_index=False)
            .agg(player_pick_count=("match_id_int", "nunique"), wins=("win_bool", "sum"))
        )

    metrics = bp_counts.merge(first_counts, on=["event_group", "hero_id"], how="outer")
    metrics = metrics.merge(wins, on=["event_group", "hero_id"], how="outer")
    metrics = metrics.merge(match_counts, on="event_group", how="left")
    for column in ["pick_count", "ban_count", "first_ban", "first_pick", "player_pick_count", "wins"]:
        metrics[column] = metrics[column].fillna(0).astype(int)
    metrics["match_count"] = metrics["match_count"].fillna(0).astype(int)
    metrics["heat_rate"] = (metrics["pick_count"] + metrics["ban_count"]) / metrics["match_count"].replace({0: pd.NA})
    metrics["pick_rate"] = metrics["pick_count"] / metrics["match_count"].replace({0: pd.NA})
    metrics["ban_rate"] = metrics["ban_count"] / metrics["match_count"].replace({0: pd.NA})
    metrics["win_rate"] = metrics["wins"] / metrics["player_pick_count"].replace({0: pd.NA})
    metrics["first_phase_contest_rate"] = (metrics["first_ban"] + metrics["first_pick"]) / metrics["match_count"].replace(
        {0: pd.NA}
    )
    metrics["patch_version"] = PATCH_VERSION
    metrics["calculation_version"] = CALCULATION_VERSION
    return metrics.sort_values(["event_group", "heat_rate"], ascending=[True, False]).reset_index(drop=True)


def _derive_position(lane_role: object, hits_5m: object) -> int:
    lane = int(pd.to_numeric(pd.Series([lane_role]), errors="coerce").fillna(0).iloc[0])
    hits = int(pd.to_numeric(pd.Series([hits_5m]), errors="coerce").fillna(0).iloc[0])
    if lane == 2:
        return 2
    if lane == 1:
        return 1 if hits >= 12 else 5
    if lane == 3:
        return 3 if hits >= 12 else 4
    return 1 if hits >= 18 else 5


def _normalize_raw_positions(raw_pos: pd.DataFrame) -> pd.DataFrame:
    if raw_pos.empty:
        return _empty_columns(["match_id_int", "steamid_int", "team_int", "lane_role", "hits_5m"])
    raw = raw_pos.copy()
    raw["match_id_int"] = _int_series(raw["match_id"])
    raw["steamid_int"] = _int_series(raw["steamid"] if "steamid" in raw else raw["account_id"])
    raw["team_int"] = _int_series(raw["team"]) if "team" in raw else pd.NA
    raw["lane_role"] = _int_series(raw["lane_role"]) if "lane_role" in raw else pd.NA
    raw["hits_5m"] = pd.to_numeric(raw["hits_5m"], errors="coerce") if "hits_5m" in raw else pd.NA
    raw = raw.dropna(subset=["match_id_int", "steamid_int"]).copy()
    for column in ["match_id_int", "steamid_int"]:
        raw[column] = raw[column].astype("int64")
    return raw


def build_position_records(
    matches: pd.DataFrame,
    players: pd.DataFrame,
    league_pos: pd.DataFrame,
    raw_pos: pd.DataFrame,
) -> pd.DataFrame:
    matches_norm = normalize_matches(matches)
    players_norm = normalize_players(players).merge(
        matches_norm[["match_id_int", "event_group"]],
        on="match_id_int",
        how="inner",
    )
    raw = _normalize_raw_positions(raw_pos)
    raw_support = raw[["match_id_int", "steamid_int", "lane_role", "hits_5m"]].drop_duplicates(
        ["match_id_int", "steamid_int"]
    )

    if league_pos.empty:
        confirmed = _empty_columns(
            [
                "event_group",
                "match_id_int",
                "steamid_int",
                "hero_id",
                "team_int",
                "win_bool",
                "position",
                "confidence_flag",
                "lane_role",
                "hits_5m",
            ]
        )
    else:
        confirmed = league_pos.copy()
        confirmed["match_id_int"] = _int_series(confirmed["match_id"])
        confirmed["steamid_int"] = _int_series(confirmed["steamid"])
        confirmed["hero_id"] = _int_series(confirmed["hero_id"])
        confirmed["position"] = _int_series(confirmed["position"])
        confirmed = confirmed.dropna(subset=["match_id_int", "steamid_int", "hero_id", "position"]).copy()
        for column in ["match_id_int", "steamid_int", "hero_id", "position"]:
            confirmed[column] = confirmed[column].astype("int64")
        confirmed = confirmed.merge(
            players_norm[["match_id_int", "steamid_int", "team_int", "win_bool", "event_group"]],
            on=["match_id_int", "steamid_int"],
            how="inner",
        )
        confirmed = confirmed.merge(raw_support, on=["match_id_int", "steamid_int"], how="left")
        confirmed["confidence_flag"] = "confirmed"
        confirmed = confirmed[
            [
                "event_group",
                "match_id_int",
                "steamid_int",
                "hero_id",
                "team_int",
                "win_bool",
                "position",
                "confidence_flag",
                "lane_role",
                "hits_5m",
            ]
        ]

    confirmed_keys = set(zip(confirmed["match_id_int"], confirmed["steamid_int"]))
    derived_rows: list[dict[str, object]] = []
    if not raw.empty and not players_norm.empty:
        raw_for_join = raw.drop(columns=["team_int"], errors="ignore")
        derived_source = raw_for_join.merge(
            players_norm[["match_id_int", "steamid_int", "hero_id", "team_int", "win_bool", "event_group"]],
            on=["match_id_int", "steamid_int"],
            how="inner",
        )
        for row in derived_source.to_dict("records"):
            key = (row["match_id_int"], row["steamid_int"])
            if key in confirmed_keys:
                continue
            derived_rows.append(
                {
                    "event_group": row["event_group"],
                    "match_id_int": int(row["match_id_int"]),
                    "steamid_int": int(row["steamid_int"]),
                    "hero_id": int(row["hero_id"]),
                    "team_int": int(row["team_int"]),
                    "win_bool": bool(row["win_bool"]),
                    "position": _derive_position(row.get("lane_role"), row.get("hits_5m")),
                    "confidence_flag": "derived",
                    "lane_role": row.get("lane_role"),
                    "hits_5m": row.get("hits_5m"),
                }
            )
    derived = pd.DataFrame(derived_rows)
    combined = pd.concat([confirmed, derived], ignore_index=True)
    if combined.empty:
        return combined
    combined["position"] = combined["position"].astype(int)
    combined["hero_id"] = combined["hero_id"].astype(int)
    combined["team_int"] = combined["team_int"].astype(int)
    combined["match_id_int"] = combined["match_id_int"].astype(int)
    combined["hits_5m"] = pd.to_numeric(combined["hits_5m"], errors="coerce").fillna(0)
    return combined.drop_duplicates(["match_id_int", "steamid_int", "hero_id", "position", "confidence_flag"])


def build_position_metrics(
    matches: pd.DataFrame,
    players: pd.DataFrame,
    league_pos: pd.DataFrame,
    raw_pos: pd.DataFrame,
) -> pd.DataFrame:
    combined = build_position_records(matches, players, league_pos, raw_pos)
    if combined.empty:
        return _empty_columns(
            [
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
            ]
        )
    grouped = (
        combined.groupby(["event_group", "hero_id", "position"], as_index=False)
        .agg(
            position_pick_count=("match_id_int", "nunique"),
            confirmed_count=("confidence_flag", lambda values: int((values == "confirmed").sum())),
            derived_count=("confidence_flag", lambda values: int((values == "derived").sum())),
        )
    )
    match_counts = (
        normalize_matches(matches)
        .groupby("event_group", as_index=False)["match_id_int"]
        .nunique()
        .rename(columns={"match_id_int": "match_count"})
    )
    grouped = grouped.merge(match_counts, on="event_group", how="left")
    grouped["position_pick_rate"] = grouped["position_pick_count"] / grouped["match_count"].replace({0: pd.NA})
    grouped["confidence_flag"] = grouped.apply(
        lambda row: "confirmed" if row["derived_count"] == 0 else ("derived" if row["confirmed_count"] == 0 else "mixed"),
        axis=1,
    )
    grouped["patch_version"] = PATCH_VERSION
    grouped["calculation_version"] = CALCULATION_VERSION
    return grouped.sort_values(["event_group", "position", "position_pick_count"], ascending=[True, True, False]).reset_index(
        drop=True
    )


def build_pair_relations(matches: pd.DataFrame, bp: pd.DataFrame, players: pd.DataFrame) -> pd.DataFrame:
    matches_norm = normalize_matches(matches)
    bp_norm = normalize_bp(bp).merge(
        matches_norm[["match_id_int", "event_group"]],
        on="match_id_int",
        how="inner",
    )
    players_norm = normalize_players(players).merge(
        matches_norm[["match_id_int", "event_group"]],
        on="match_id_int",
        how="inner",
    )
    records: list[dict[str, object]] = []

    for _match_id, picks in players_norm.groupby("match_id_int"):
        event_group = str(picks["event_group"].iloc[0])
        picks = picks.drop_duplicates(["team_int", "hero_id"])
        for _, a in picks.iterrows():
            for _, b in picks.iterrows():
                if int(a["hero_id"]) == int(b["hero_id"]):
                    continue
                same_side = int(a["team_int"]) == int(b["team_int"])
                records.append(
                    {
                        "patch_version": PATCH_VERSION,
                        "event_group": event_group,
                        "hero_a_id": int(a["hero_id"]),
                        "hero_b_id": int(b["hero_id"]),
                        "relation_type": "synergy" if same_side else "counter",
                        "evidence_type": "same_side_winrate_synergy" if same_side else "vs_winrate_counter",
                        "sample_size": 1,
                        "wins": int(bool(a["win_bool"])),
                        "losses": int(not bool(a["win_bool"])),
                        "rate": float(bool(a["win_bool"])),
                        "delta_vs_baseline": 0.0,
                    }
                )

    for _match_id, draft in bp_norm.groupby("match_id_int"):
        event_group = str(draft["event_group"].iloc[0])
        ordered = draft.sort_values("ord_int")
        picks_only = ordered[ordered["is_pick_bool"]]
        for _, pick in picks_only.iterrows():
            later = ordered[ordered["ord_int"] > int(pick["ord_int"])]
            for _, action in later.iterrows():
                same_team = int(action["team_int"]) == int(pick["team_int"])
                if bool(action["is_pick_bool"]) and not same_team:
                    evidence_type = "enemy_pick_after_a_counter"
                    relation_type = "counter"
                elif (not bool(action["is_pick_bool"])) and same_team:
                    evidence_type = "own_ban_after_a_counter"
                    relation_type = "counter"
                elif (not bool(action["is_pick_bool"])) and not same_team:
                    evidence_type = "enemy_ban_after_a_synergy"
                    relation_type = "synergy"
                else:
                    continue
                records.append(
                    {
                        "patch_version": PATCH_VERSION,
                        "event_group": event_group,
                        "hero_a_id": int(pick["hero_id"]),
                        "hero_b_id": int(action["hero_id"]),
                        "relation_type": relation_type,
                        "evidence_type": evidence_type,
                        "sample_size": 1,
                        "wins": 0,
                        "losses": 0,
                        "rate": 1.0,
                        "delta_vs_baseline": 0.0,
                    }
                )

    frame = pd.DataFrame(records)
    if frame.empty:
        return _empty_columns(
            [
                "patch_version",
                "event_group",
                "hero_a_id",
                "hero_b_id",
                "relation_type",
                "evidence_type",
                "sample_size",
                "wins",
                "losses",
                "rate",
                "delta_vs_baseline",
                "confidence_flag",
            ]
        )
    grouped = (
        frame.groupby(
            ["patch_version", "event_group", "hero_a_id", "hero_b_id", "relation_type", "evidence_type"],
            as_index=False,
        )
        .agg(
            sample_size=("sample_size", "sum"),
            wins=("wins", "sum"),
            losses=("losses", "sum"),
            rate=("rate", "mean"),
            delta_vs_baseline=("delta_vs_baseline", "mean"),
        )
        .sort_values(["event_group", "sample_size"], ascending=[True, False])
        .reset_index(drop=True)
    )
    grouped["confidence_flag"] = grouped["sample_size"].apply(lambda value: "low_sample" if value < 5 else "ok")
    grouped["calculation_version"] = CALCULATION_VERSION
    return grouped


def _append_laning_record(
    records: list[dict[str, object]],
    event_group: str,
    hero_a_id: int,
    hero_b_id: int,
    relation_type: str,
    evidence_type: str,
    lane_context: str,
    hit_diff_5m: float,
) -> None:
    records.append(
        {
            "patch_version": PATCH_VERSION,
            "event_group": event_group,
            "hero_a_id": hero_a_id,
            "hero_b_id": hero_b_id,
            "relation_type": relation_type,
            "evidence_type": evidence_type,
            "lane_context": lane_context,
            "sample_size": 1,
            "lane_advantage_wins": int(hit_diff_5m > 0),
            "lane_advantage_losses": int(hit_diff_5m <= 0),
            "hit_diff_5m": float(hit_diff_5m),
        }
    )


def build_laning_relations(
    matches: pd.DataFrame,
    players: pd.DataFrame,
    league_pos: pd.DataFrame,
    raw_pos: pd.DataFrame,
) -> pd.DataFrame:
    position_rows = build_position_records(matches, players, league_pos, raw_pos)
    records: list[dict[str, object]] = []
    if position_rows.empty:
        return _empty_columns(
            [
                "patch_version",
                "event_group",
                "hero_a_id",
                "hero_b_id",
                "relation_type",
                "evidence_type",
                "lane_context",
                "sample_size",
                "lane_advantage_wins",
                "lane_advantage_losses",
                "lane_advantage_rate",
                "avg_hit_diff_5m",
                "confidence_flag",
            ]
        )

    for _match_id, match_rows in position_rows.groupby("match_id_int"):
        event_group = str(match_rows["event_group"].iloc[0])
        team_ids = sorted(match_rows["team_int"].dropna().astype(int).unique())
        if len(team_ids) < 2:
            continue
        for team_a in team_ids:
            opponents = [team for team in team_ids if team != team_a]
            if not opponents:
                continue
            team_b = opponents[0]
            a_rows = match_rows[match_rows["team_int"].astype(int).eq(team_a)]
            b_rows = match_rows[match_rows["team_int"].astype(int).eq(team_b)]

            a_mid = a_rows[a_rows["position"].eq(2)]
            b_mid = b_rows[b_rows["position"].eq(2)]
            if not a_mid.empty and not b_mid.empty:
                a = a_mid.iloc[0]
                b = b_mid.iloc[0]
                _append_laning_record(
                    records,
                    event_group,
                    int(a["hero_id"]),
                    int(b["hero_id"]),
                    "counter",
                    "mid_hits_counter",
                    "mid",
                    float(a["hits_5m"]) - float(b["hits_5m"]),
                )

            safe_pair = a_rows[a_rows["position"].isin([1, 5])]
            off_pair = b_rows[b_rows["position"].isin([3, 4])]
            if safe_pair.empty or off_pair.empty:
                continue
            lane_diff = float(safe_pair["hits_5m"].sum()) - float(off_pair["hits_5m"].sum())
            for _, a in safe_pair.iterrows():
                for _, b in off_pair.iterrows():
                    _append_laning_record(
                        records,
                        event_group,
                        int(a["hero_id"]),
                        int(b["hero_id"]),
                        "counter",
                        "side_hits_counter",
                        "side",
                        lane_diff,
                    )
            for _, a in safe_pair.iterrows():
                for _, b in safe_pair.iterrows():
                    if int(a["hero_id"]) == int(b["hero_id"]):
                        continue
                    _append_laning_record(
                        records,
                        event_group,
                        int(a["hero_id"]),
                        int(b["hero_id"]),
                        "synergy",
                        "side_same_lane_hits_synergy",
                        "side",
                        lane_diff,
                    )

    frame = pd.DataFrame(records)
    if frame.empty:
        return build_laning_relations(pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), pd.DataFrame())
    grouped = (
        frame.groupby(
            ["patch_version", "event_group", "hero_a_id", "hero_b_id", "relation_type", "evidence_type", "lane_context"],
            as_index=False,
        )
        .agg(
            sample_size=("sample_size", "sum"),
            lane_advantage_wins=("lane_advantage_wins", "sum"),
            lane_advantage_losses=("lane_advantage_losses", "sum"),
            avg_hit_diff_5m=("hit_diff_5m", "mean"),
        )
        .reset_index(drop=True)
    )
    grouped["lane_advantage_rate"] = grouped["lane_advantage_wins"] / grouped["sample_size"].replace({0: pd.NA})
    grouped["confidence_flag"] = grouped["sample_size"].apply(lambda value: "low_sample" if value < 5 else "ok")
    grouped["calculation_version"] = CALCULATION_VERSION
    return grouped.sort_values(["event_group", "sample_size"], ascending=[True, False]).reset_index(drop=True)


def load_raw_frames() -> dict[str, pd.DataFrame]:
    return {
        "matches": read_jsonl(RAW_DIR / "match_overview.jsonl"),
        "bp": read_jsonl(RAW_DIR / "match_picks_bans.jsonl"),
        "players": read_jsonl(RAW_DIR / "players.jsonl"),
        "heroes": read_jsonl(RAW_DIR / "heroes.jsonl"),
        "league_pos": read_jsonl(RAW_DIR / "match_league_position.jsonl"),
        "raw_pos": read_jsonl(RAW_DIR / "match_player_positions.jsonl"),
    }


def build_metric_packages() -> dict[str, int]:
    frames = load_raw_frames()
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

    hero_event = build_hero_event_metrics(frames["matches"], frames["bp"], frames["players"])
    position_metrics = build_position_metrics(
        frames["matches"],
        frames["players"],
        frames["league_pos"],
        frames["raw_pos"],
    )
    relations = build_pair_relations(frames["matches"], frames["bp"], frames["players"])
    laning_relations = build_laning_relations(
        frames["matches"],
        frames["players"],
        frames["league_pos"],
        frames["raw_pos"],
    )
    events = (
        normalize_matches(frames["matches"])
        .groupby("event_group", as_index=False)
        .agg(match_count=("match_id_int", "nunique"), first_match=("start_date", "min"), last_match=("start_date", "max"))
    )

    write_json_records(PUBLIC_DATA_DIR / "hero_event_metrics.json", hero_event)
    write_json_records(PUBLIC_DATA_DIR / "hero_position_metrics.json", position_metrics)
    write_json_records(PUBLIC_DATA_DIR / "hero_pair_relations.json", relations)
    write_json_records(PUBLIC_DATA_DIR / "hero_laning_relations.json", laning_relations)
    write_json_records(PUBLIC_DATA_DIR / "heroes.json", frames["heroes"])
    write_json_records(PUBLIC_DATA_DIR / "events.json", events)

    return {
        "hero_event_metrics": len(hero_event),
        "hero_position_metrics": len(position_metrics),
        "hero_pair_relations": len(relations),
        "hero_laning_relations": len(laning_relations),
        "heroes": len(frames["heroes"]),
        "events": len(events),
    }
