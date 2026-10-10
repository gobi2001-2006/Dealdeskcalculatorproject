"""Check the current Neon DB migration state and Wave 2 table existence."""
from app.db.session import get_engine
from sqlalchemy import text

engine = get_engine()
with engine.connect() as conn:
    result = conn.execute(text("SELECT version_num FROM alembic_version"))
    versions = [r[0] for r in result]
    print("Applied alembic revisions:", versions)

    wave2 = [
        "product_families", "products", "features",
        "product_descriptions", "packs", "pack_versions", "pack_items",
    ]
    wave1 = [
        "currencies", "countries", "fx_rates", "units_of_measure",
        "deployment_models", "pricing_models", "deployment_pricing_options",
        "customer_tiers", "contract_terms",
    ]
    print("\n--- Wave 1 tables ---")
    for t in wave1:
        exists = conn.execute(
            text("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name=:t AND table_schema='public')"),
            {"t": t}
        ).scalar()
        print(f"  {t}: {'EXISTS' if exists else 'MISSING'}")

    print("\n--- Wave 2 tables ---")
    for t in wave2:
        exists = conn.execute(
            text("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name=:t AND table_schema='public')"),
            {"t": t}
        ).scalar()
        print(f"  {t}: {'EXISTS' if exists else 'MISSING'}")

    # Check triggers
    print("\n--- Lock-protection triggers ---")
    for trig in ["trg_protect_locked_pack_version", "trg_protect_locked_pack_items"]:
        exists = conn.execute(
            text("SELECT EXISTS(SELECT 1 FROM information_schema.triggers WHERE trigger_name=:t)"),
            {"t": trig}
        ).scalar()
        print(f"  {trig}: {'EXISTS' if exists else 'MISSING'}")
