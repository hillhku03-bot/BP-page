import pandas as pd

from scripts.dota_meta.metrics import build_laning_relations


def test_side_lane_uses_one_five_vs_three_four_hits_advantage():
    matches = pd.DataFrame([{"match_id": 1, "event_group": "A"}])
    players = pd.DataFrame(
        [
            {"match_id": 1, "steamid": 101, "hero_id": 11, "team": 2, "win": 1},
            {"match_id": 1, "steamid": 105, "hero_id": 15, "team": 2, "win": 1},
            {"match_id": 1, "steamid": 203, "hero_id": 23, "team": 3, "win": 0},
            {"match_id": 1, "steamid": 204, "hero_id": 24, "team": 3, "win": 0},
        ]
    )
    league_pos = pd.DataFrame(
        [
            {"match_id": 1, "steamid": 101, "hero_id": 11, "position": 1},
            {"match_id": 1, "steamid": 105, "hero_id": 15, "position": 5},
            {"match_id": 1, "steamid": 203, "hero_id": 23, "position": 3},
            {"match_id": 1, "steamid": 204, "hero_id": 24, "position": 4},
        ]
    )
    raw_pos = pd.DataFrame(
        [
            {"match_id": 1, "steamid": 101, "team": 2, "lane_role": 1, "hits_5m": 20},
            {"match_id": 1, "steamid": 105, "team": 2, "lane_role": 1, "hits_5m": 4},
            {"match_id": 1, "steamid": 203, "team": 3, "lane_role": 3, "hits_5m": 12},
            {"match_id": 1, "steamid": 204, "team": 3, "lane_role": 3, "hits_5m": 3},
        ]
    )

    relations = build_laning_relations(matches, players, league_pos, raw_pos)
    counter = relations[
        (relations["hero_a_id"] == 11)
        & (relations["hero_b_id"] == 23)
        & (relations["lane_context"] == "side")
        & (relations["relation_type"] == "counter")
    ].iloc[0]

    assert counter["sample_size"] == 1
    assert counter["avg_hit_diff_5m"] == 9
    assert counter["lane_advantage_rate"] == 1.0
