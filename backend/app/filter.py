CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]


def filter_corrections(corrections: list[dict], user_level: str) -> list[dict]:
    """
    Filter corrections to only include those at or below the user's CEFR level.

    Args:
        corrections: list of correction dicts with 'error_level' key
        user_level: CEFR level string (A1-C2)

    Returns:
        Filtered list of corrections
    """
    if user_level not in CEFR_ORDER:
        return corrections
    cutoff = CEFR_ORDER.index(user_level)
    return [
        c for c in corrections
        if c.get("error_level") in CEFR_ORDER and CEFR_ORDER.index(c["error_level"]) <= cutoff
    ]
