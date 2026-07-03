from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.dota_meta.metrics import load_raw_frames
from scripts.dota_meta.quality import validate_raw_coverage, write_quality_report


def main() -> None:
    frames = load_raw_frames()
    report = validate_raw_coverage(
        frames["matches"],
        frames["bp"],
        frames["players"],
        frames["league_pos"],
        frames["raw_pos"],
    )
    write_quality_report(report)
    print(f"matches: {report['totals']['matches']}")
    print(f"issues: {report['totals']['issue_count']}")


if __name__ == "__main__":
    main()
