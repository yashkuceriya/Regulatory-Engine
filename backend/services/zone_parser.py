"""
Zone string parser — deconstructs LA zoning strings into components.

Examples:
  "R1-1"    → base=R1, hd=1, hillside=False
  "R1H-1"   → base=R1, hd=1, hillside=True, variation=H
  "R1V2-1"  → base=R1, hd=1, variation=V2
  "R2-1"    → base=R2, hd=1
  "[Q]R1-1" → base=R1, hd=1, suffix_flags=[Q]
"""
from __future__ import annotations

import re
from backend.models.entities import ZoneComponents


# Zone string regex — handles the core LA zoning patterns used in this POC.
# Pattern: [prefix_flags] base_zone [variation] - height_district [suffixes]
ZONE_PATTERN = re.compile(
    r"^"
    r"((?:\[[^\]]+\]\s*)*)"                                  # Optional bracket flags
    r"\s*"
    r"(RD\d(?:\.\d)?|RS|RE|RA|R\d|C[RMWP\d]*|M[R\d]*|P[BF]?|OS|A[12]|PF)"
    r"(RW|H|V\d?|F|R)?"
    r"(?:-(1(?:VL|XL|L)?|[2-4]))?"
    r"(.*)?"
    r"$",
    re.IGNORECASE,
)

# Known R1 variation patterns
R1_VARIATIONS = {"V", "V1", "V2", "V3", "F", "R", "H", "RW"}


def parse_zone_string(zone_string: str) -> ZoneComponents:
    """
    Parse an LA zoning string into structured components.

    Args:
        zone_string: Raw zoning string, e.g. "R1-1", "R1H-1", "[Q]R2-1"

    Returns:
        ZoneComponents with base_zone, height_district, hillside, variation, suffix_flags
    """
    raw = zone_string.strip()

    # Some zoning strings are purely bracket flags with no base zone
    # e.g. "[DF1-WH1-5] [P2-FA] [CPIO]" — extract the first bracket group
    # as the base zone identifier if no standard match is found.
    # Also handle compound strings like "C2-1-CPIO" by trying the first segment.
    match = ZONE_PATTERN.match(raw)
    if not match:
        # Try to extract a meaningful base zone from the raw string.
        # Strip bracket flags [Q], parenthetical flags (T)(Q), and retry.
        stripped = re.sub(r"\[[^\]]*\]\s*", "", raw).strip()
        stripped = re.sub(r"\([^)]*\)\s*", "", stripped).strip()
        if stripped:
            match = ZONE_PATTERN.match(stripped)

        if not match:
            # Extract base zone from first recognizable token
            base = raw.split("-")[0] if "-" in raw else raw
            # Clean bracket and parenthetical prefixes
            base = re.sub(r"\[[^\]]*\]", "", base).strip()
            base = re.sub(r"\([^)]*\)", "", base).strip()
            # Collect all bracket and parenthetical flags
            bracket_flags = re.findall(r"\[([^\]]+)\]", raw)
            bracket_flags.extend(re.findall(r"\(([^)]+)\)", raw))
            return ZoneComponents(
                raw=raw,
                base_zone=base if base else "UNKNOWN",
                suffix_flags=bracket_flags or ["PARSE_FAILED"],
            )

    prefix_flags_str, base_zone, variation, height_district, remaining = match.groups()

    # Normalize
    base_zone = base_zone.upper() if base_zone else raw
    variation = variation.upper() if variation else None
    height_district = height_district if height_district else None

    # Determine hillside
    hillside = variation == "H" if variation else False

    # Collect suffix flags
    suffix_flags: list[str] = []
    if prefix_flags_str:
        for group in re.findall(r"\[([^\]]+)\]", prefix_flags_str):
            suffix_flags.append(group.strip())
    if remaining and remaining.strip():
        trailing = remaining.strip().lstrip("-").strip()
        if trailing:
            suffix_flags.extend(
                part for part in re.split(r"[\s,;/]+", trailing)
                if part
            )

    return ZoneComponents(
        raw=raw,
        base_zone=base_zone,
        height_district=height_district,
        hillside=hillside,
        variation=variation if variation != "H" else None,
        suffix_flags=suffix_flags,
    )


def is_residential(components: ZoneComponents) -> bool:
    """Check if zone is residential (R1, R2, R3, etc.)."""
    return components.base_zone.startswith("R")


def is_in_scope(components: ZoneComponents) -> bool:
    """Check if zone is in POC scope (R1 or R2 only)."""
    return components.base_zone in ("R1", "R2")
