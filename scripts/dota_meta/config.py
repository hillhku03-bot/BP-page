from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


PATCH_VERSION = "7.41"
CALCULATION_VERSION = "dota-741-hero-meta-v1"

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = PROJECT_ROOT.parent

RAW_DIR = WORKSPACE_ROOT / "work" / "data" / "raw" / "dota_741_hero_meta_monitor"
PROCESSED_DIR = WORKSPACE_ROOT / "work" / "data" / "processed" / "dota_741_hero_meta_monitor"
REPORT_DIR = WORKSPACE_ROOT / "work" / "reports" / "dota_741_hero_meta_monitor"
OUTPUT_DIR = WORKSPACE_ROOT / "outputs" / "dota_741_hero_meta_monitor"
PUBLIC_DATA_DIR = PROJECT_ROOT / "public" / "data"


@dataclass(frozen=True)
class EventGroup:
    name: str
    league_ids: tuple[int, ...]
    treatment: str
    region_by_league_id: dict[int, str]


EVENT_GROUPS: dict[str, EventGroup] = {
    "ESL One Birmingham 2026": EventGroup(
        name="ESL One Birmingham 2026",
        league_ids=(19422,),
        treatment="single_event",
        region_by_league_id={19422: "global"},
    ),
    "PGL Wallachia 2026 Season 8": EventGroup(
        name="PGL Wallachia 2026 Season 8",
        league_ids=(19543,),
        treatment="single_event",
        region_by_league_id={19543: "global"},
    ),
    "DreamLeague Season 29": EventGroup(
        name="DreamLeague Season 29",
        league_ids=(19696,),
        treatment="single_event",
        region_by_league_id={19696: "global"},
    ),
    "BLAST SLAM VII": EventGroup(
        name="BLAST SLAM VII",
        league_ids=(19101,),
        treatment="single_event",
        region_by_league_id={19101: "global"},
    ),
    "EWC 2026 Regional Qualifiers": EventGroup(
        name="EWC 2026 Regional Qualifiers",
        league_ids=(19699,),
        treatment="qualifiers_as_one_event",
        region_by_league_id={19699: "regional"},
    ),
    "TI 2026 Regional Qualifiers": EventGroup(
        name="TI 2026 Regional Qualifiers",
        league_ids=(19890, 19891, 19892, 19893, 19894),
        treatment="regional_qualifiers_merged",
        region_by_league_id={
            19890: "north_america",
            19891: "south_america",
            19892: "europe",
            19893: "china",
            19894: "southeast_asia",
        },
    ),
}

LEAGUE_ID_TO_EVENT_GROUP = {
    league_id: event_name
    for event_name, event in EVENT_GROUPS.items()
    for league_id in event.league_ids
}


def event_group_for_league(league_id: int) -> str:
    return LEAGUE_ID_TO_EVENT_GROUP[int(league_id)]


def all_sample_league_ids() -> tuple[int, ...]:
    return tuple(sorted(LEAGUE_ID_TO_EVENT_GROUP))
