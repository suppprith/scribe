"""Standalone demo: template-based NLG summary from extracted features.

    python scripts/nlp/nlg_demo.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from app.nlp.nlg import generate_summary  # noqa: E402

FULL = {
    "participants": ["Ana", "Bo", "Chen"],
    "duration_seconds": 1530,
    "keywords": ["budget", "roadmap", "timeline", "marketing"],
    "topics": ["Q3 budget approval", "release timeline", "marketing launch"],
    "decisions": ["Approved the Q3 marketing spend", "Moved the release to Friday"],
    "action_items": [
        {"text": "Finalize the budget", "owner": "Ana"},
        {"text": "Fix the API bug blocking deploy", "owner": "Chen"},
    ],
    "highlights": ["The timeline depends on budget approval."],
}

# Edge case: a solo recording with no decisions or action items.
SPARSE = {"participants": ["Dana"], "duration_seconds": 45, "keywords": ["standup"]}


def main() -> None:
    print("=" * 60)
    print("FULL MEETING")
    print("=" * 60)
    print(generate_summary(FULL)["prose"])

    print("\n" + "=" * 60)
    print("EDGE CASE (solo, no decisions/action items)")
    print("=" * 60)
    print(generate_summary(SPARSE)["prose"])


if __name__ == "__main__":
    main()
