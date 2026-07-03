import pandas as pd

from scripts.dota_meta.metrics import build_hero_event_metrics


def test_heat_rate_uses_pick_plus_ban_over_match_count():
    matches = pd.DataFrame(
        [
            {"match_id": 1, "event_group": "A", "league_id": 10, "win_status": 1},
            {"match_id": 2, "event_group": "A", "league_id": 10, "win_status": 2},
        ]
    )
    bp = pd.DataFrame(
        [
            {"match_id": "1", "ord": "0", "is_pick": "false", "team": "2", "hero_id": "11"},
            {"match_id": "1", "ord": "7", "is_pick": "true", "team": "2", "hero_id": "11"},
            {"match_id": "2", "ord": "0", "is_pick": "false", "team": "3", "hero_id": "12"},
        ]
    )
    players = pd.DataFrame(
        [
            {"match_id": "1", "hero_id": 11, "team": 2, "win": 1},
            {"match_id": "2", "hero_id": 12, "team": 3, "win": 1},
        ]
    )

    metrics = build_hero_event_metrics(matches, bp, players)
    row = metrics[(metrics["event_group"] == "A") & (metrics["hero_id"] == 11)].iloc[0]
    assert row["pick_count"] == 1
    assert row["ban_count"] == 1
    assert row["match_count"] == 2
    assert row["heat_rate"] == 1.0


def test_heat_rate_accepts_numeric_pick_flags():
    matches = pd.DataFrame([{"match_id": 1, "event_group": "A", "league_id": 10, "win_status": 1}])
    bp = pd.DataFrame(
        [
            {"match_id": 1, "ord": 0, "is_pick": 0, "team": 2, "hero_id": 11},
            {"match_id": 1, "ord": 7, "is_pick": 1, "team": 2, "hero_id": 12},
        ]
    )
    players = pd.DataFrame([{"match_id": 1, "hero_id": 12, "team": 2, "win": 1}])

    metrics = build_hero_event_metrics(matches, bp, players)

    assert metrics.loc[metrics["hero_id"] == 11, "ban_count"].iloc[0] == 1
    assert metrics.loc[metrics["hero_id"] == 12, "pick_count"].iloc[0] == 1


def test_duplicate_bp_action_rows_do_not_inflate_heat():
    matches = pd.DataFrame([{"match_id": 1, "event_group": "A", "league_id": 10, "win_status": 1}])
    bp = pd.DataFrame(
        [
            {"match_id": 1, "ord": 0, "is_pick": 0, "team": 2, "hero_id": 11},
            {"match_id": 1, "ord": 0, "is_pick": 0, "team": 2, "hero_id": 11},
        ]
    )
    players = pd.DataFrame([{"match_id": 1, "hero_id": 12, "team": 2, "win": 1}])

    metrics = build_hero_event_metrics(matches, bp, players)

    row = metrics.loc[metrics["hero_id"] == 11].iloc[0]
    assert row["ban_count"] == 1
    assert row["heat_rate"] == 1.0
