import pandas as pd

from scripts.dota_meta.metrics import build_pair_relations, build_position_metrics


def test_confirmed_position_metrics_use_league_position_first():
    matches = pd.DataFrame([{"match_id": 1, "event_group": "A"}])
    players = pd.DataFrame([{"match_id": "1", "steamid": 101, "hero_id": 11, "team": 2, "win": 1}])
    league_pos = pd.DataFrame(
        [{"match_id": 1, "steamid": 101, "hero_id": 11, "position": 2, "is_radiant": 2}]
    )
    raw_pos = pd.DataFrame([{"match_id": 1, "steamid": "101", "team": 2, "lane_role": 2, "hits_5m": 20}])

    metrics = build_position_metrics(matches, players, league_pos, raw_pos)
    row = metrics.iloc[0]
    assert row["hero_id"] == 11
    assert row["position"] == 2
    assert row["confidence_flag"] == "confirmed"
    assert row["position_pick_count"] == 1


def test_enemy_ban_after_a_is_synergy_evidence():
    matches = pd.DataFrame([{"match_id": 1, "event_group": "A", "win_status": 1}])
    bp = pd.DataFrame(
        [
            {"match_id": "1", "ord": "7", "is_pick": "true", "team": "2", "hero_id": "11"},
            {"match_id": "1", "ord": "9", "is_pick": "false", "team": "3", "hero_id": "12"},
        ]
    )
    players = pd.DataFrame(
        [
            {"match_id": "1", "hero_id": 11, "team": 2, "win": 1},
            {"match_id": "1", "hero_id": 12, "team": 3, "win": 0},
        ]
    )
    relations = build_pair_relations(matches, bp, players)
    evidence = relations[
        (relations["hero_a_id"] == 11)
        & (relations["hero_b_id"] == 12)
        & (relations["evidence_type"] == "enemy_ban_after_a_synergy")
    ]
    assert len(evidence) == 1
    assert evidence.iloc[0]["relation_type"] == "synergy"
    assert evidence.iloc[0]["sample_size"] == 1


def test_position_metrics_ignore_unconfirmed_raw_positions():
    matches = pd.DataFrame([{"match_id": 1, "event_group": "A"}])
    players = pd.DataFrame([{"match_id": 1, "steamid": 101, "hero_id": 11, "team": 2, "win": 1}])
    raw_pos = pd.DataFrame([{"match_id": 1, "steamid": 101, "team": 2, "lane_role": 1, "hits_5m": 18}])

    metrics = build_position_metrics(matches, players, pd.DataFrame(), raw_pos)

    assert metrics.empty


def test_roster_position_metrics_count_as_confirmed_positions():
    matches = pd.DataFrame([{"match_id": 1, "event_group": "A", "league_id": 100}])
    players = pd.DataFrame([{"match_id": 1, "steamid": 101, "hero_id": 11, "team": 2, "win": 1}])
    roster_pos = pd.DataFrame([{"league_id": 100, "steamid": 101, "position": 1}])
    raw_pos = pd.DataFrame([{"match_id": 1, "steamid": 101, "team": 2, "lane_role": 3, "hits_5m": 0}])

    metrics = build_position_metrics(matches, players, pd.DataFrame(), raw_pos, roster_pos)

    row = metrics.iloc[0]
    assert row["hero_id"] == 11
    assert row["position"] == 1
    assert row["confidence_flag"] == "confirmed"
