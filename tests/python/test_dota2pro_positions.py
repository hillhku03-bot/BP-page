import pandas as pd

from scripts.dota_meta.dota2pro_positions import (
    build_confirmed_position_metrics_from_roster,
    normalize_dota2pro_roster,
)


def test_web_roster_positions_build_confirmed_hero_position_metrics():
    matches = pd.DataFrame(
        [
            {"match_id": 1, "event_group": "EWC 2026 Regional Qualifiers", "league_id": 19699},
            {"match_id": 2, "event_group": "EWC 2026 Regional Qualifiers", "league_id": 19699},
        ]
    )
    players = pd.DataFrame(
        [
            {"match_id": 1, "steamid": 101, "hero_id": 11, "team": 2, "persona": "Carry"},
            {"match_id": 1, "steamid": 102, "hero_id": 12, "team": 2, "persona": "Mid"},
            {"match_id": 2, "steamid": 101, "hero_id": 11, "team": 3, "persona": "Carry"},
        ]
    )
    roster = normalize_dota2pro_roster(
        pd.DataFrame(
            [
                {"league_id": 19699, "steamid64": 101, "position": 1},
                {"league_id": 19699, "steamid64": 102, "position": 2},
            ]
        )
    )

    metrics, missing = build_confirmed_position_metrics_from_roster(matches, players, roster)

    assert missing.empty
    row = metrics[(metrics["hero_id"] == 11) & (metrics["position"] == 1)].iloc[0]
    assert row["event_group"] == "EWC 2026 Regional Qualifiers"
    assert row["position_pick_count"] == 2
    assert row["match_count"] == 2
    assert row["position_pick_rate"] == 1.0
    assert row["confidence_flag"] == "confirmed"


def test_web_roster_positions_report_players_missing_from_web_records():
    matches = pd.DataFrame([{"match_id": 1, "event_group": "TI 2026 Regional Qualifiers", "league_id": 19890}])
    players = pd.DataFrame(
        [
            {"match_id": 1, "steamid": 201, "hero_id": 21, "team": 2, "persona": "Known"},
            {"match_id": 1, "steamid": 999, "hero_id": 22, "team": 3, "persona": "Unknown"},
        ]
    )
    roster = normalize_dota2pro_roster(pd.DataFrame([{"league_id": 19890, "steamid64": 201, "position": "4号位"}]))

    metrics, missing = build_confirmed_position_metrics_from_roster(matches, players, roster)

    assert metrics["position_pick_count"].sum() == 1
    missing_row = missing.iloc[0]
    assert missing_row["event_group"] == "TI 2026 Regional Qualifiers"
    assert missing_row["league_id"] == 19890
    assert missing_row["steamid"] == 999
    assert missing_row["persona"] == "Unknown"
