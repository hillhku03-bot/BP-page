import pandas as pd

from scripts.dota_meta.metrics import tag_bp_phase


def test_first_phase_mapping_uses_zero_based_ord():
    rows = pd.DataFrame(
        [
            {"ord": "0"},
            {"ord": "6"},
            {"ord": "7"},
            {"ord": "8"},
            {"ord": "9"},
            {"ord": "23"},
        ]
    )
    tagged = tag_bp_phase(rows)
    assert list(tagged["bp_phase"]) == [
        "first_ban",
        "first_ban",
        "first_pick",
        "first_pick",
        "second_ban",
        "final_pick",
    ]
