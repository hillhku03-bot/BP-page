from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.dota_meta.db import masked_db_url
from scripts.dota_meta.extract import run_extraction


def main() -> None:
    print(f"DB: {masked_db_url()}")
    counts = run_extraction()
    for name, count in counts.items():
        print(f"{name}: {count}")


if __name__ == "__main__":
    main()
