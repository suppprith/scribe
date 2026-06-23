"""Template-based natural-language generation for meeting summaries — the custom
replacement for an external LLM. It slot-fills templates from features already
extracted by the other NLP modules (participants, keywords/topics, decisions,
action items, highlights, duration). No model, fully deterministic, and every
section degrades gracefully when its feature is empty."""

from __future__ import annotations

from typing import Optional, TypedDict


class ActionItem(TypedDict, total=False):
    text: str
    owner: str


class SummaryFeatures(TypedDict, total=False):
    participants: list[str]
    duration_seconds: float
    keywords: list[str]
    topics: list[str]
    decisions: list[str]
    action_items: list[ActionItem]
    highlights: list[str]


class Summary(TypedDict):
    overview: str
    prose: str


def _oxford(items: list[str]) -> str:
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ", ".join(items[:-1]) + f", and {items[-1]}"


def _plural(count: int, singular: str, plural: Optional[str] = None) -> str:
    return singular if count == 1 else (plural or f"{singular}s")


def _format_duration(seconds: Optional[float]) -> Optional[str]:
    if not seconds or seconds <= 0:
        return None
    minutes, secs = divmod(int(seconds), 60)
    if minutes == 0:
        return f"{secs} {_plural(secs, 'second')}"
    if secs == 0:
        return f"{minutes} {_plural(minutes, 'minute')}"
    return f"{minutes} {_plural(minutes, 'minute')} {secs} {_plural(secs, 'second')}"


def _overview(features: SummaryFeatures) -> str:
    participants = features.get("participants") or []
    keywords = features.get("keywords") or features.get("topics") or []

    parts: list[str] = []
    count = len(participants)
    if count == 0:
        parts.append("This recording had no identified participants.")
    elif count == 1:
        parts.append(f"This was a solo recording by {participants[0]}.")
    else:
        parts.append(f"{count} participants took part: {_oxford(participants)}.")

    duration = _format_duration(features.get("duration_seconds"))
    if duration:
        parts.append(f"The session ran for about {duration}.")

    if keywords:
        parts.append(f"The conversation centered on {_oxford(keywords[:5])}.")

    return " ".join(parts)


def _bullet_section(title: str, lines: list[str], empty: str) -> list[str]:
    out = [f"### {title}"]
    if lines:
        out.extend(f"- {line}" for line in lines if line)
    else:
        out.append(f"_{empty}_")
    return out


def _action_line(item: ActionItem) -> str:
    text = (item.get("text") or "").strip()
    owner = (item.get("owner") or "").strip()
    if not text:
        return ""
    return f"**{owner}**: {text}" if owner else text


def generate_summary(features: SummaryFeatures) -> Summary:
    """Produce a readable, structured Markdown summary from extracted features."""
    overview = _overview(features)

    topics = features.get("topics") or features.get("keywords") or []
    decisions = features.get("decisions") or []
    action_items = [line for item in (features.get("action_items") or []) if (line := _action_line(item))]
    highlights = features.get("highlights") or []

    body: list[str] = ["## Meeting summary", "", overview, ""]
    body += _bullet_section("Topics", topics, "No clear topics emerged.")
    body.append("")
    body += _bullet_section("Decisions", decisions, "No decisions were recorded.")
    body.append("")
    body += _bullet_section("Action items", action_items, "No action items were captured.")
    body.append("")
    body += _bullet_section("Highlights", [f'"{h}"' for h in highlights], "No highlights stood out.")

    return {"overview": overview, "prose": "\n".join(body)}
