from scripts.dota_meta.config import PATCH_VERSION, EVENT_GROUPS, event_group_for_league


def test_patch_version_is_741():
    assert PATCH_VERSION == "7.41"


def test_ti_regional_leagues_map_to_one_event_group():
    ti_ids = {19890, 19891, 19892, 19893, 19894}
    assert {event_group_for_league(league_id) for league_id in ti_ids} == {
        "TI 2026 Regional Qualifiers"
    }


def test_required_event_groups_are_present():
    expected = {
        "ESL One Birmingham 2026",
        "PGL Wallachia 2026 Season 8",
        "DreamLeague Season 29",
        "BLAST SLAM VII",
        "EWC 2026 Regional Qualifiers",
        "TI 2026 Regional Qualifiers",
    }
    assert set(EVENT_GROUPS) == expected
