from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.dota_meta.metrics import build_metric_packages


def main() -> None:
    counts = build_metric_packages()
    for name, count in counts.items():
        print(f"{name}: {count}")


if __name__ == "__main__":
    main()
