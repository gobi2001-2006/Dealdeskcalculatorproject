# Proposal Summary Product Identity Audit

## Symptom

On Page 6 and in the export, a pack line was sometimes grouped under a different product name or code from one calculation to the next.

## Root cause

`pricing_engine.py` took the product from `pack_version.pack_items[0].feature.product`. The `PackVersion.pack_items` relationship had **no ordering**, so PostgreSQL could return the items in any order. When a pack contained features from more than one product, the "first" product, and therefore the summary group, was not deterministic.

## Fix

1. **Stable ordering.** `models/catalogue.py` now declares `PackVersion.pack_items` with `order_by="PackItem.feature_id"`.
2. **Identity rule.** In `pricing_engine.py`, the engine collects the distinct products of all pack items, then:
   - **One product:** use that product's id, name and code (unchanged for normal packs).
   - **More than one product:** the pack is its own group, using the pack's name and code. No product is picked arbitrarily.
   - **No product:** fall back to the pack's product family, as before.
3. **Multi-country products keep the key `CODE@ISO`.**

## Test

`backend/tests/test_audit_fixes_pg.py::test_pack_product_identity_is_deterministic`:

- It builds a mixed pack with its items inserted in reverse order.
- It calculates twice and asserts the same codes both times: `DEV_TA_MAX` for the seed pack and `AUDIT_MIXED` for the mixed pack.
- It cleans up its own catalogue rows.
- It passes in the full PG suite (749 passed).
