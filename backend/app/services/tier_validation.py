"""Validation service for customer tier headcount bands."""

from typing import Any, Iterable


class TierBandOverlapError(ValueError):
    """Raised when customer tier headcount bands overlap."""

    pass


def validate_tier_range(employee_min: int, employee_max: int | None) -> None:
    """Validate a single customer tier's min and max headcount boundaries."""
    if employee_min < 0:
        raise ValueError(
            f"employee_min must be non-negative, got {employee_min}"
        )
    if employee_max is not None and employee_max < employee_min:
        raise ValueError(
            f"employee_max ({employee_max}) must be >= employee_min ({employee_min})"
        )


def validate_customer_tier_bands(
    tiers: Iterable[Any],
) -> None:
    """Validate that a collection of customer tier bands do not overlap.

    Accepts objects with `employee_min`, `employee_max`, and optional `name` and `status`
    attributes or dictionaries with corresponding keys.
    Only checks tiers that are active or do not have a retired status.
    """
    parsed: list[dict[str, Any]] = []

    for tier in tiers:
        if isinstance(tier, dict):
            status = tier.get("status", "active")
            if status == "retired":
                continue
            name = tier.get("name", "Unnamed Tier")
            e_min = tier.get("employee_min")
            e_max = tier.get("employee_max")
        else:
            status = getattr(tier, "status", "active")
            if status == "retired":
                continue
            name = getattr(tier, "name", "Unnamed Tier")
            e_min = getattr(tier, "employee_min")
            e_max = getattr(tier, "employee_max")

        if e_min is None:
            raise ValueError(f"Tier '{name}' must have an employee_min value")

        validate_tier_range(e_min, e_max)
        parsed.append({"name": name, "min": e_min, "max": e_max})

    if not parsed:
        return

    # Sort by employee_min
    sorted_tiers = sorted(parsed, key=lambda t: t["min"])

    # Check for duplicate min or overlaps
    for i in range(len(sorted_tiers) - 1):
        curr = sorted_tiers[i]
        nxt = sorted_tiers[i + 1]

        # If current tier is open-ended (max is None), no subsequent tier can exist
        if curr["max"] is None:
            raise TierBandOverlapError(
                f"Tier '{curr['name']}' is open-ended (employee_max=None) but overlaps with subsequent tier '{nxt['name']}' starting at {nxt['min']}"
            )

        # If current max >= next min, there is an overlap
        if curr["max"] >= nxt["min"]:
            raise TierBandOverlapError(
                f"Tier '{curr['name']}' (range {curr['min']}-{curr['max']}) overlaps with tier '{nxt['name']}' (range {nxt['min']}-{nxt['max'] if nxt['max'] is not None else 'open'})"
            )
