"""Standalone demo: the full /summarize pipeline on a sample transcript.

    python scripts/summarize_demo.py
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.pipeline.summarize import summarize  # noqa: E402

UTTERANCES = [
    ("Ana", "Welcome everyone. Today we need to finalize the Q3 budget and the release timeline."),
    ("Bo", "The release timeline slips to Friday because of the API bug blocking the deploy pipeline."),
    ("Chen", "We approved the marketing spend yesterday, so marketing can launch after budget sign off."),
    ("Ana", "Agreed. Let's move the release to Friday. Chen, please fix the API bug before then."),
    ("Bo", "I'll send the updated roadmap to the team and schedule the next standup for Monday."),
]


def main() -> None:
    transcript = " ".join(text for _, text in UTTERANCES)
    participants = list(dict.fromkeys(speaker for speaker, _ in UTTERANCES))

    result = summarize(transcript, participants, duration_seconds=1530)

    print("STRUCTURED FIELDS")
    print("  topics:      ", result["topics"])
    print("  keywords:    ", result["keywords"])
    print("  decisions:   ", result["decisions"])
    print("  action_items:", result["action_items"])
    print("  highlights:  ", result["highlights"])
    print("\nPROSE\n")
    print(result["prose"])


if __name__ == "__main__":
    main()
