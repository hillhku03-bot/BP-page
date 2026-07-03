import pandas as pd

from scripts.dota_meta.quality import validate_raw_coverage


def test_quality_flags_incomplete_bp_rows():
    matches = pd.DataFrame([{"match_id": 1, "event_group": "A"}])
    bp = pd.DataFrame(
        [{"match_id": "1", "ord": str(i), "is_pick": "true", "team": "2", "hero_id": str(i)} for i in range(10)]
    )
    players = pd.DataFrame([{"match_id": "1", "hero_id": i, "team": 2, "win": 1} for i in range(10)])
    league_pos = pd.DataFrame()

    report = validate_raw_coverage(matches, bp, players, league_pos)

    assert report["totals"]["matches"] == 1
    assert report["issues"][0]["issue_type"] == "bp_row_count_not_24"
