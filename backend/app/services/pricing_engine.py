# backend/app/services/pricing_engine.py
"""Phase D Pricing Calculation Engine for Adrenalin Deal Desk.

Authoritative business logic based on:
"Proposal_Pricing_Model_Calculation Explained.pdf"

Formulas implemented strictly in Python Decimal:
1. Subscription Pricing:
   - Annual Consumption Fee = Rate per Unit * Average Monthly Volume * 12
   - Annual Subscription Before Item Discount = Platform Fee + Annual Consumption Fee
   - Item Discount Amount = Item Subscription Before Discount * Item Discount % / 100
   - Item Subscription After Discount = Item Subscription Before Discount - Item Discount Amount
   - Product Subscription Subtotal Before Overall Discount = Sum(Item Subscription After Discount)
   - Product Subscription Discount Amount = Product Subtotal * Product Subscription Discount % / 100
   - Product Subscription Total After Discounts = Product Subtotal - Product Subscription Discount Amount

2. Service & Implementation Pricing:
   - Day Rate = Regional Hourly Rate * Standard Hours Per Day
   - Service Line Total = Man-Days * Day Rate
   - Product Service Subtotal Before Discount = Sum(Service Line Totals)
   - Product Service Discount Amount = Product Service Subtotal * Product Service Discount % / 100
   - Product Service Total After Discount = Product Service Subtotal - Product Service Discount Amount

3. Product and Proposal Totals:
   - Product Total in Native Currency = Product Subscription Total After Discounts + Product Service Total After Discount
   - FX Rate multiplier convention (FxRate: 1 from_currency = rate to_currency):
       Product Total in Reporting Currency = Product Total in Native Currency * FX Multiplier
   - Total Proposal in Reporting Currency = Sum(Converted Product Totals)

4. Snapshot:
   - Preserves complete audit trail in CalculationSnapshot (JSONB).
"""

from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload

from app.models.catalogue import Feature, Pack, PackItem, PackVersion, Product
from app.models.master_data import (
    Country,
    Currency,
    CustomerTier,
    DeploymentModel,
    FxRate,
    PricingModel,
    UnitOfMeasure,
)
from app.models.proposals import (
    CalculationSnapshot,
    Proposal,
    ProposalCountry,
    ProposalLineItem,
    ProposalServiceLine,
    ProposalVersion,
)
from app.models.rate_card import RateCard, RateCardVersion, ServiceRate


# ---------------------------------------------------------------------------
# Domain Exceptions
# ---------------------------------------------------------------------------

class PricingCalculationError(Exception):
    """Base exception for calculation engine errors."""
    pass


class ProposalNotFoundError(PricingCalculationError):
    """Raised when proposal or proposal version does not exist."""
    pass


class MissingCatalogueReferenceError(PricingCalculationError):
    """Raised when pack_version, feature, or product cannot be resolved."""
    pass


class MissingRateCardMatchError(PricingCalculationError):
    """Raised when no matching rate card is found for the given dimensions."""
    pass


class AmbiguousRateCardMatchError(PricingCalculationError):
    """Raised when multiple conflicting rate cards match the dimensions."""
    pass


class MissingServiceRateError(PricingCalculationError):
    """Raised when regional service rate cannot be resolved for a service line."""
    pass


class MissingFxRateError(PricingCalculationError):
    """Raised when foreign exchange rate cannot be resolved for a currency pair."""
    pass


class InvalidDiscountError(PricingCalculationError):
    """Raised when discount percentage is invalid (< 0 or > 100)."""
    pass


class MissingConfigurationError(PricingCalculationError):
    """Raised when required business configuration (e.g. hours per day) is missing."""
    pass


class CurrencyMismatchError(PricingCalculationError):
    """Raised when amounts in different native currencies would be added together."""
    pass


# ---------------------------------------------------------------------------
# Helper Rounding & Decimal Formatting
# ---------------------------------------------------------------------------

TWO_PLACES = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")


def quantize_currency(value: Decimal) -> Decimal:
    """Round to 2 decimal places for financial reporting."""
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def quantize_rate(value: Decimal) -> Decimal:
    """Round to 4 decimal places for unit rates and fees."""
    return value.quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Public rate-card resolution (used by the API and by the engine)
# ---------------------------------------------------------------------------

def resolve_rate_card(
    db: Session,
    *,
    rate_card_version_id: int,
    country_id: int,
    deployment_model_id: int,
    pricing_model_id: int,
    tier_id: int,
    uom_id: int,
    pack_version_id: Optional[int] = None,
    feature_id: Optional[int] = None,
) -> RateCard:
    """Resolve exactly one rate-card row from all six dimensions or raise a named error."""
    rate_card = PricingCalculationEngine(db)._find_rate_card(
        rate_card_version_id=rate_card_version_id,
        pack_version_id=pack_version_id,
        feature_id=feature_id,
        country_id=country_id,
        tier_id=tier_id,
        uom_id=uom_id,
        deployment_model_id=deployment_model_id,
        pricing_model_id=pricing_model_id,
    )
    if rate_card is None:
        c_obj = db.get(Country, country_id) if country_id else None
        d_obj = db.get(DeploymentModel, deployment_model_id) if deployment_model_id else None
        p_obj = db.get(PricingModel, pricing_model_id) if pricing_model_id else None
        t_obj = db.get(CustomerTier, tier_id) if tier_id else None
        c_str = c_obj.name if c_obj else f"country_id={country_id}"
        d_str = d_obj.name if d_obj else f"deployment_model_id={deployment_model_id}"
        p_str = p_obj.name if p_obj else f"pricing_model_id={pricing_model_id}"
        t_str = t_obj.name if t_obj else f"tier_id={tier_id}"
        raise MissingRateCardMatchError(
            f"No saved rate card exists for {d_str} + {p_str} in {c_str} for {t_str}. "
            "Configure the rate card before calculating the proposal."
        )
    return rate_card


# ---------------------------------------------------------------------------
# Pricing Engine Core
# ---------------------------------------------------------------------------

class PricingCalculationEngine:
    """Engine executing deterministic commercial calculations."""

    def __init__(self, db: Session):
        self.db = db

    def calculate_proposal(
        self,
        proposal_id: int,
        version_id: Optional[int] = None,
        product_discounts: Optional[Dict[str, Decimal]] = None,
        product_service_discounts: Optional[Dict[str, Decimal]] = None,
        default_hours_per_day: Optional[Decimal] = None,
        user_id: Optional[int] = None,
        contract_term_months: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Execute full server-side calculation and persist CalculationSnapshot.

        Atomic: the snapshot and the refreshed line amounts are committed together,
        or nothing is written at all.
        """
        try:
            return self._calculate_proposal(
                proposal_id=proposal_id,
                version_id=version_id,
                product_discounts=product_discounts,
                product_service_discounts=product_service_discounts,
                default_hours_per_day=default_hours_per_day,
                user_id=user_id,
                contract_term_months=contract_term_months,
            )
        except Exception:
            self.db.rollback()
            raise

    def _calculate_proposal(
        self,
        proposal_id: int,
        version_id: Optional[int],
        product_discounts: Optional[Dict[str, Decimal]],
        product_service_discounts: Optional[Dict[str, Decimal]],
        default_hours_per_day: Optional[Decimal],
        user_id: Optional[int],
        contract_term_months: Optional[int] = None,
    ) -> Dict[str, Any]:
        # 1. Load proposal & active version
        proposal, version = self._load_proposal_and_version(proposal_id, version_id)

        # 2. Extract context dimensions
        rate_card_version_id = version.rate_card_version_id
        if not rate_card_version_id:
            raise MissingConfigurationError(
                f"Proposal version {version.id} does not have a pinned rate_card_version_id"
            )

        customer = proposal.customer
        customer_tier_id = customer.customer_tier_id if customer else None
        if customer_tier_id is None:
            raise MissingConfigurationError(
                f"Customer '{customer.code if customer else proposal.customer_id}' has no customer tier; "
                "the tier is a mandatory rate-card dimension and cannot be ignored"
            )

        # Resolve the priced country block (country + deployment model + pricing model).
        primary_block = self._resolve_primary_country_block(proposal)
        if primary_block is None:
            raise MissingConfigurationError(
                f"Proposal {proposal.code} has no country; add a proposal country before calculating"
            )
        country_id = primary_block.country_id
        deployment_model_id = primary_block.deployment_model_id
        pricing_model_id = primary_block.pricing_model_id
        warnings: List[str] = []
        other_countries = [c.country_id for c in proposal.countries if c.id != primary_block.id]
        if other_countries:
            warnings.append(
                "Line items are not country-specific: all lines were priced against the primary country "
                f"(country_id={country_id}). Countries {sorted(other_countries)} were NOT priced separately."
            )

        reporting_currency = proposal.currency
        reporting_currency_id = proposal.currency_id

        # 3. Calculate Subscription Line Items
        line_item_results = []
        # Group items by product code / name
        product_items_map: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        product_meta_map: Dict[str, Dict[str, Any]] = {}

        for item in version.line_items:
            item_result = self._calculate_subscription_item(
                item=item,
                rate_card_version_id=rate_card_version_id,
                default_country_id=country_id,
                default_tier_id=customer_tier_id,
                deployment_model_id=deployment_model_id,
                pricing_model_id=pricing_model_id,
                persist_amounts=(version.status == "draft"),
                contract_term_months=contract_term_months,
            )
            line_item_results.append(item_result)

            prod_key = item_result["product_code"] or "DEFAULT_PRODUCT"
            product_items_map[prod_key].append(item_result)
            if prod_key not in product_meta_map:
                product_meta_map[prod_key] = {
                    "product_id": item_result["product_id"],
                    "product_name": item_result["product_name"],
                    "product_code": prod_key,
                    "native_currency_id": item_result["currency_id"],
                    "native_currency_code": item_result["currency_code"],
                }

        # 4. Calculate Service Lines
        service_line_results = []
        product_services_map: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

        for s_line in version.service_lines:
            s_result = self._calculate_service_line(
                service_line=s_line,
                default_country_id=country_id,
                default_hours_per_day=default_hours_per_day,
                persist_amounts=(version.status == "draft"),
            )
            service_line_results.append(s_result)

            # Map service line to product if possible, otherwise associate with first product or GENERAL
            target_prod = s_result.get("product_code")
            if not target_prod:
                if product_items_map:
                    target_prod = next(iter(product_items_map.keys()))
                else:
                    target_prod = "SERVICES"
                    if target_prod not in product_meta_map:
                        product_meta_map[target_prod] = {
                            "product_id": None,
                            "product_name": "Professional Services",
                            "product_code": target_prod,
                            "native_currency_id": s_result["currency_id"],
                            "native_currency_code": s_result["currency_code"],
                        }
            s_result["attached_product_code"] = target_prod
            product_services_map[target_prod].append(s_result)

        if service_line_results and len(product_items_map) > 1:
            warnings.append(
                "Service lines are not linked to a product; all service lines were attached to "
                f"product '{next(iter(product_items_map.keys()))}'."
            )

        # 5. Consolidate by Product
        all_product_keys = set(product_items_map.keys()).union(set(product_services_map.keys()))
        if not all_product_keys and not line_item_results and not service_line_results:
            # Empty proposal handling
            all_product_keys = set()

        product_discounts = product_discounts or {}
        product_service_discounts = product_service_discounts or {}
        unknown_keys = (set(product_discounts) | set(product_service_discounts)) - all_product_keys
        if unknown_keys:
            raise InvalidDiscountError(
                f"Discount supplied for product code(s) not on this proposal: {sorted(unknown_keys)}. "
                f"Valid product codes: {sorted(all_product_keys)}"
            )

        product_results = []
        total_proposal_reporting = Decimal("0.00")
        total_proposal_annual_reporting = Decimal("0.00")
        total_proposal_contract_reporting = Decimal("0.00")
        term_dec = Decimal(str(contract_term_months)) if contract_term_months and contract_term_months > 0 else Decimal("12")

        for prod_key in sorted(all_product_keys):
            p_items = product_items_map.get(prod_key, [])
            p_services = product_services_map.get(prod_key, [])
            meta = product_meta_map.get(prod_key, {})

            # Subscription Subtotal — use _dec_ Decimal keys for arithmetic precision
            sub_subtotal_before_discount = sum(
                (item["_dec_item_subscription_after_discount"] for item in p_items),
                Decimal("0.00"),
            )
            sub_discount_pct = Decimal(str(product_discounts.get(prod_key, Decimal("0.00"))))
            if sub_discount_pct < 0 or sub_discount_pct > 100:
                raise InvalidDiscountError(
                    f"Product subscription discount % for {prod_key} must be between 0 and 100, got {sub_discount_pct}"
                )
            sub_discount_amt = quantize_currency(sub_subtotal_before_discount * (sub_discount_pct / Decimal("100.00")))
            sub_total_after_discount = sub_subtotal_before_discount - sub_discount_amt

            # Full-Contract Subscription Subtotal
            contract_sub_subtotal_before_discount = sum(
                (item["_dec_contract_subscription_after_discount"] for item in p_items),
                Decimal("0.00"),
            )
            contract_sub_discount_amt = quantize_currency(
                contract_sub_subtotal_before_discount * (sub_discount_pct / Decimal("100.00"))
            )
            contract_sub_total_after_discount = contract_sub_subtotal_before_discount - contract_sub_discount_amt

            # Service Subtotal — use _dec_ Decimal keys for arithmetic precision (one-time effort)
            serv_subtotal_before_discount = sum(
                (Decimal(str(srv["service_line_total"])) for srv in p_services),
                Decimal("0.00"),
            )
            # One overall service discount per product (PDF section 4); never per service line.
            serv_discount_pct = Decimal(str(product_service_discounts.get(prod_key, Decimal("0.00"))))
            if serv_discount_pct < 0 or serv_discount_pct > 100:
                raise InvalidDiscountError(
                    f"Product service discount % for {prod_key} must be between 0 and 100, got {serv_discount_pct}"
                )
            serv_discount_amt = quantize_currency(serv_subtotal_before_discount * (serv_discount_pct / Decimal("100.00")))
            serv_total_after_discount = serv_subtotal_before_discount - serv_discount_amt

            # Product Native Total (Annual & Contract)
            product_native_total = sub_total_after_discount + serv_total_after_discount
            contract_product_native_total = contract_sub_total_after_discount + serv_total_after_discount

            # Native Currency - every amount in a product total must share one currency.
            native_curr_id = meta.get("native_currency_id") or reporting_currency_id
            native_curr_code = meta.get("native_currency_code") or (reporting_currency.code if reporting_currency else "USD")
            mixed = {
                (r["currency_id"], r["currency_code"])
                for r in (*p_items, *p_services)
                if r["currency_id"] != native_curr_id
            }
            if mixed:
                raise CurrencyMismatchError(
                    f"Product '{prod_key}' mixes currencies: expected {native_curr_code} but found "
                    f"{sorted(code for _, code in mixed)}. Rate-card and service-rate currencies must match."
                )

            # FX Conversion (convention: 1 unit of from_currency = rate units of to_currency)
            fx = self._resolve_fx(
                from_currency_id=native_curr_id,
                to_currency_id=reporting_currency_id,
            )
            fx_rate_multiplier = fx["multiplier"]
            pair_str = fx["pair"]
            product_reporting_total = quantize_currency(product_native_total * fx_rate_multiplier)
            contract_product_reporting_total = quantize_currency(contract_product_native_total * fx_rate_multiplier)

            product_results.append({
                "product_id": meta.get("product_id"),
                "product_name": meta.get("product_name"),
                "product_code": prod_key,
                "native_currency_id": native_curr_id,
                "native_currency_code": native_curr_code,
                "contract_term_months": int(term_dec),
                "subscription_subtotal_before_discount": float(sub_subtotal_before_discount),
                "subscription_discount_pct": float(sub_discount_pct),
                "subscription_discount_amount": float(sub_discount_amt),
                "subscription_total_after_discount": float(sub_total_after_discount),
                "contract_subscription_subtotal_before_discount": float(contract_sub_subtotal_before_discount),
                "contract_subscription_discount_amount": float(contract_sub_discount_amt),
                "contract_subscription_total_after_discount": float(contract_sub_total_after_discount),
                "service_subtotal_before_discount": float(serv_subtotal_before_discount),
                "service_discount_pct": float(serv_discount_pct),
                "service_discount_amount": float(serv_discount_amt),
                "service_total_after_discount": float(serv_total_after_discount),
                "product_native_total": float(product_native_total),
                "contract_product_native_total": float(contract_product_native_total),
                "fx_rate_multiplier": float(fx_rate_multiplier),
                "currency_pair": pair_str,
                "fx_rate_id": fx["fx_rate_id"],
                "fx_effective_date": fx["effective_date"],
                "fx_rate_source": fx["source"],
                "fx_inverted": fx["inverted"],
                "reporting_currency_id": reporting_currency_id,
                "reporting_currency_code": reporting_currency.code if reporting_currency else "USD",
                "product_reporting_total": float(product_reporting_total),
                "contract_product_reporting_total": float(contract_product_reporting_total),
                "line_items": p_items,
                "service_lines": p_services,
            })

            total_proposal_annual_reporting += product_reporting_total
            total_proposal_contract_reporting += contract_product_reporting_total
            total_proposal_reporting += product_reporting_total

        # Strip internal _dec_ keys (Decimal) from dicts before JSON serialisation
        def _strip_dec(d: Dict[str, Any]) -> Dict[str, Any]:
            return {k: v for k, v in d.items() if not k.startswith("_dec_")}

        serialisable_product_results = [
            {
                **{k: v for k, v in p.items() if k not in ("line_items", "service_lines")},
                "line_items": [_strip_dec(li) for li in p["line_items"]],
                "service_lines": [_strip_dec(sl) for sl in p["service_lines"]],
            }
            for p in product_results
        ]

        # 6. Build Snapshot Payload (JSON-safe — no Decimal values)
        snapshot_payload = {
            "proposal_id": proposal.id,
            "proposal_code": proposal.code,
            "proposal_version_id": version.id,
            "version_no": version.version_no,
            "rate_card_version_id": rate_card_version_id,
            "calculated_at": datetime.now(timezone.utc).isoformat(),
            "reporting_currency_id": reporting_currency_id,
            "reporting_currency_code": reporting_currency.code if reporting_currency else "USD",
            "contract_term_months": int(term_dec),
            "pricing_context": {
                "country_id": country_id,
                "deployment_model_id": deployment_model_id,
                "pricing_model_id": pricing_model_id,
                "customer_tier_id": customer_tier_id,
                "contract_term_months": int(term_dec),
                "fx_convention": "1 unit of from_currency = rate units of to_currency",
            },
            "warnings": warnings,
            "total_proposal_annual_reporting_currency": float(total_proposal_annual_reporting),
            "total_proposal_contract_reporting_currency": float(total_proposal_contract_reporting),
            "total_proposal_reporting_currency": float(total_proposal_reporting),
            "products": serialisable_product_results,
            "all_subscription_line_items": [_strip_dec(li) for li in line_item_results],
            "all_service_lines": service_line_results,
        }

        # 7. Persist Snapshot Immutably
        snapshot = CalculationSnapshot(
            proposal_version_id=version.id,
            snapshot_payload=snapshot_payload,
            calculated_by_user_id=user_id,
        )
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)

        return {
            "snapshot_id": snapshot.id,
            "proposal_id": proposal.id,
            "proposal_version_id": version.id,
            "version_no": version.version_no,
            "calculated_at": snapshot.calculated_at.isoformat() if snapshot.calculated_at else datetime.now(timezone.utc).isoformat(),
            "reporting_currency_code": reporting_currency.code if reporting_currency else "USD",
            "total_proposal_reporting_currency": float(total_proposal_reporting),
            "contract_term_months": int(term_dec),
            "total_proposal_annual_reporting_currency": float(total_proposal_annual_reporting),
            "total_proposal_contract_reporting_currency": float(total_proposal_contract_reporting),
            "snapshot_payload": snapshot_payload,
        }

    def get_latest_calculation(self, proposal_id: int) -> Dict[str, Any]:
        """Retrieve the most recent saved CalculationSnapshot without recalculating."""
        proposal, version = self._load_proposal_and_version(proposal_id)

        stmt = (
            select(CalculationSnapshot)
            .where(CalculationSnapshot.proposal_version_id == version.id)
            .order_by(desc(CalculationSnapshot.calculated_at), desc(CalculationSnapshot.id))
            .limit(1)
        )
        snapshot = self.db.scalars(stmt).first()
        if not snapshot:
            raise ProposalNotFoundError(
                f"No calculation snapshot found for proposal {proposal_id} (version {version.version_no})"
            )

        reporting_curr_code = snapshot.snapshot_payload.get("reporting_currency_code", "USD")
        total_reporting = snapshot.snapshot_payload.get("total_proposal_reporting_currency", 0.0)

        return {
            "snapshot_id": snapshot.id,
            "proposal_id": proposal.id,
            "proposal_version_id": version.id,
            "version_no": version.version_no,
            "calculated_at": snapshot.calculated_at.isoformat() if snapshot.calculated_at else None,
            "reporting_currency_code": reporting_curr_code,
            "total_proposal_reporting_currency": total_reporting,
            "contract_term_months": snapshot.snapshot_payload.get("contract_term_months", 12),
            "total_proposal_annual_reporting_currency": snapshot.snapshot_payload.get("total_proposal_annual_reporting_currency", total_reporting),
            "total_proposal_contract_reporting_currency": snapshot.snapshot_payload.get("total_proposal_contract_reporting_currency", total_reporting),
            "snapshot_payload": snapshot.snapshot_payload,
        }

    # -----------------------------------------------------------------------
    # Subscription Item Calculations
    # -----------------------------------------------------------------------

    def _calculate_subscription_item(
        self,
        item: ProposalLineItem,
        rate_card_version_id: int,
        default_country_id: Optional[int],
        default_tier_id: Optional[int],
        deployment_model_id: Optional[int] = None,
        pricing_model_id: Optional[int] = None,
        persist_amounts: bool = True,
        contract_term_months: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Calculates a single subscription line item using the PDF formulas."""
        # Validate discount
        item_discount_pct = item.discount_pct or Decimal("0.00")
        if item_discount_pct < 0 or item_discount_pct > 100:
            raise InvalidDiscountError(
                f"Item discount percentage must be between 0 and 100, got {item_discount_pct}"
            )

        # Resolve Target & Product
        product_id = None
        product_name = None
        product_code = None
        target_name = None

        if item.feature_id:
            feature = self.db.get(Feature, item.feature_id)
            if not feature:
                raise MissingCatalogueReferenceError(f"Feature with id {item.feature_id} not found")
            target_name = feature.name
            product = feature.product
            if product:
                product_id = product.id
                product_name = product.name
                product_code = product.code
        elif item.pack_version_id:
            pack_version = self.db.get(PackVersion, item.pack_version_id)
            if not pack_version:
                raise MissingCatalogueReferenceError(f"PackVersion with id {item.pack_version_id} not found")
            pack = pack_version.pack
            target_name = f"{pack.name} v{pack_version.version_no}" if pack else f"PackVersion {item.pack_version_id}"

            # Resolve product from pack's items or family
            if pack_version.pack_items:
                first_feat = pack_version.pack_items[0].feature
                if first_feat and first_feat.product:
                    product_id = first_feat.product.id
                    product_name = first_feat.product.name
                    product_code = first_feat.product.code
            if not product_name and pack and pack.product_family:
                product_name = pack.product_family.name
                product_code = pack.product_family.code
            if not product_name and pack:
                product_name = pack.name
                product_code = pack.code

        # Rate resolution: exactly one rate-card row must match all dimensions.
        # Prices are NEVER taken from the request (no client-side price fallback).
        rate_card = self._find_rate_card(
            rate_card_version_id=rate_card_version_id,
            pack_version_id=item.pack_version_id,
            feature_id=item.feature_id,
            country_id=default_country_id,
            tier_id=default_tier_id,
            uom_id=item.uom_id,
            deployment_model_id=deployment_model_id,
            pricing_model_id=pricing_model_id,
        )
        if rate_card is None:
            c_name = self.db.get(Country, default_country_id).name if default_country_id and self.db.get(Country, default_country_id) else f"Country {default_country_id}"
            d_name = self.db.get(DeploymentModel, deployment_model_id).name if deployment_model_id and self.db.get(DeploymentModel, deployment_model_id) else f"Deployment {deployment_model_id}"
            p_name = self.db.get(PricingModel, pricing_model_id).name if pricing_model_id and self.db.get(PricingModel, pricing_model_id) else f"Pricing Model {pricing_model_id}"
            t_name = self.db.get(CustomerTier, default_tier_id).name if default_tier_id and self.db.get(CustomerTier, default_tier_id) else f"Tier {default_tier_id}"
            raise MissingRateCardMatchError(
                f"No saved rate card exists for {d_name} + {p_name} in {c_name} for {t_name} ('{target_name}', line {item.line_number}). "
                "Configure the rate card before calculating the proposal."
            )

        platform_fee = rate_card.fixed_fee or Decimal("0.00")
        rate_per_unit = rate_card.unit_rate or Decimal("0.00")
        currency_id = rate_card.currency_id
        currency_code = rate_card.currency.code if rate_card.currency else str(currency_id)

        avg_monthly_volume = item.quantity or Decimal("0.00")
        term_dec = Decimal(str(contract_term_months)) if contract_term_months and contract_term_months > 0 else Decimal("12")

        # FORMULA (PDF Page 2 & 4):
        # 1. Annual Figures (12-month period)
        # Annual Consumption Fee = Rate per Unit * Average Monthly Volume * 12
        annual_consumption_fee = quantize_currency(rate_per_unit * avg_monthly_volume * Decimal("12"))

        # Annual Subscription Before Item Discount = Annual Platform Fee + Annual Consumption Fee
        subscription_before_discount = quantize_currency(platform_fee + annual_consumption_fee)

        # Item Discount Amount = Item Subscription Before Discount * Item Discount % / 100
        item_discount_amount = quantize_currency(
            subscription_before_discount * (item_discount_pct / Decimal("100.00"))
        )

        # Item Subscription After Discount = Item Subscription Before Discount - Item Discount Amount
        subscription_after_discount = subscription_before_discount - item_discount_amount

        # 2. Dynamic Contract-Period Figures (term_dec months)
        # Contract Consumption Fee = Rate per Unit * Average Monthly Volume * Contract Months
        contract_consumption_fee = quantize_currency(rate_per_unit * avg_monthly_volume * term_dec)
        contract_platform_fee = quantize_currency(platform_fee * (term_dec / Decimal("12")))
        contract_subscription_before_discount = quantize_currency(contract_platform_fee + contract_consumption_fee)
        contract_discount_amount = quantize_currency(
            contract_subscription_before_discount * (item_discount_pct / Decimal("100.00"))
        )
        contract_subscription_after_discount = contract_subscription_before_discount - contract_discount_amount

        # Refresh the cached amounts on the line (draft versions only; issued versions stay untouched).
        if persist_amounts:
            item.list_unit_price = quantize_rate(rate_per_unit)
            item.net_unit_price = quantize_rate(rate_per_unit * (Decimal("1.00") - (item_discount_pct / Decimal("100.00"))))
            item.extended_amount = quantize_currency(subscription_after_discount)

        return {
            "line_item_id": item.id,
            "line_number": item.line_number,
            "pack_version_id": item.pack_version_id,
            "feature_id": item.feature_id,
            "target_name": target_name,
            "product_id": product_id,
            "product_name": product_name or "Standard Module",
            "product_code": product_code or "MODULE",
            "uom_id": item.uom_id,
            "rate_card_id": rate_card.id,
            "currency_id": currency_id,
            "currency_code": currency_code,
            # Decimal fields (internal arithmetic — do NOT convert to float here)
            "_dec_platform_fee": platform_fee,
            "_dec_rate_per_unit": rate_per_unit,
            "_dec_avg_monthly_volume": avg_monthly_volume,
            "_dec_annual_consumption_fee": annual_consumption_fee,
            "_dec_subscription_before_discount": subscription_before_discount,
            "_dec_item_discount_pct": item_discount_pct,
            "_dec_item_discount_amount": item_discount_amount,
            "_dec_item_subscription_after_discount": subscription_after_discount,
            "_dec_contract_term_months": term_dec,
            "_dec_contract_consumption_fee": contract_consumption_fee,
            "_dec_contract_platform_fee": contract_platform_fee,
            "_dec_contract_subscription_before_discount": contract_subscription_before_discount,
            "_dec_contract_discount_amount": contract_discount_amount,
            "_dec_contract_subscription_after_discount": contract_subscription_after_discount,
            # Float fields (for JSON serialisation)
            "platform_fee": float(platform_fee),
            "rate_per_unit": float(rate_per_unit),
            "average_monthly_volume": float(avg_monthly_volume),
            "annual_consumption_fee": float(annual_consumption_fee),
            "item_subscription_before_discount": float(subscription_before_discount),
            "item_discount_pct": float(item_discount_pct),
            "item_discount_amount": float(item_discount_amount),
            "item_subscription_after_discount": float(subscription_after_discount),
            "contract_term_months": int(term_dec),
            "contract_consumption_fee": float(contract_consumption_fee),
            "contract_platform_fee": float(contract_platform_fee),
            "contract_subscription_before_discount": float(contract_subscription_before_discount),
            "contract_discount_amount": float(contract_discount_amount),
            "contract_subscription_after_discount": float(contract_subscription_after_discount),
        }

    # -----------------------------------------------------------------------
    # Service Line Calculations
    # -----------------------------------------------------------------------

    def _calculate_service_line(
        self,
        service_line: ProposalServiceLine,
        default_country_id: Optional[int],
        default_hours_per_day: Optional[Decimal],
        persist_amounts: bool = True,
    ) -> Dict[str, Any]:
        """Calculates a single service line using PDF formulas."""
        # PDF section 4: service discounts exist only as ONE overall discount per product.
        if service_line.discount_pct and service_line.discount_pct > 0:
            raise InvalidDiscountError(
                f"Service line '{service_line.role_name}' has an individual discount of "
                f"{service_line.discount_pct}%; individual service-line discounts are not permitted. "
                "Use the product-level service discount instead."
            )

        service_rate = None
        if service_line.service_rate_id:
            service_rate = self.db.get(ServiceRate, service_line.service_rate_id)
        elif default_country_id:
            # Match by role name & country, valid today
            today = date.today()
            stmt = select(ServiceRate).where(
                ServiceRate.country_id == default_country_id,
                ServiceRate.role_name == service_line.role_name,
                ServiceRate.status == "active",
                ServiceRate.valid_from <= today,
                (ServiceRate.valid_to.is_(None)) | (ServiceRate.valid_to >= today),
            )
            matches = self.db.scalars(stmt).all()
            if len(matches) == 1:
                service_rate = matches[0]
            elif len(matches) > 1:
                raise AmbiguousRateCardMatchError(
                    f"Multiple active service rates found for role '{service_line.role_name}' and country {default_country_id}"
                )

        if service_rate:
            hourly_rate = service_rate.hourly_rate
            hours_per_day = service_rate.hours_per_day or default_hours_per_day or Decimal("8.00")
            day_rate = service_rate.daily_rate
            if day_rate is None and hourly_rate is not None:
                day_rate = quantize_currency(hourly_rate * hours_per_day)
            currency_id = service_rate.currency_id
            currency_code = service_rate.currency.code if service_rate.currency else "INR"
        else:
            # Rates come only from the service-rate master (no client-supplied rate fallback).
            raise MissingServiceRateError(
                f"No service rate resolved for service line '{service_line.role_name}' "
                f"(id={service_line.id}, country_id={default_country_id})"
            )

        if day_rate is None or day_rate <= 0:
            raise MissingServiceRateError(
                f"Resolved day rate for role '{service_line.role_name}' is invalid ({day_rate})"
            )

        man_days = service_line.days_or_hours or Decimal("0.00")

        # FORMULA (PDF Page 2 & 4):
        # Service Line Total = Man-Days * Day Rate
        line_total = quantize_currency(man_days * day_rate)


        # Refresh the cached amounts on the line (draft versions only).
        if persist_amounts:
            service_line.rate_applied = quantize_rate(day_rate)
            service_line.extended_amount = quantize_currency(line_total)

        return {
            "service_line_id": service_line.id,
            "role_name": service_line.role_name,
            "service_rate_id": service_rate.id if service_rate else None,
            "man_days": float(man_days),
            "hourly_rate": float(hourly_rate) if hourly_rate else None,
            "standard_hours_per_day": float(hours_per_day),
            "day_rate": float(day_rate),
            "service_line_total": float(line_total),
            "currency_id": currency_id,
            "currency_code": currency_code,
            "discount_pct": 0.0,
            "product_code": getattr(service_line, "product_code", None),
        }

    # -----------------------------------------------------------------------
    # FX Rate Resolution
    # -----------------------------------------------------------------------

    def _resolve_fx_multiplier(
        self,
        from_currency_id: int,
        to_currency_id: int,
    ) -> Tuple[Decimal, str]:
        """Backward-compatible wrapper returning (multiplier, pair description)."""
        fx = self._resolve_fx(from_currency_id, to_currency_id)
        return fx["multiplier"], fx["pair"]

    def _resolve_fx(
        self,
        from_currency_id: int,
        to_currency_id: int,
        as_of: Optional[date] = None,
    ) -> Dict[str, Any]:
        """Resolve the FX multiplier. Convention: 1 unit of from_currency = `rate` units of to_currency.

        Uses the newest rate effective on or before `as_of` (default today). A reverse-direction
        rate is used only when no direct rate exists, and the result is flagged `inverted=True`
        so the snapshot always shows which row was used and how.
        """
        if from_currency_id == to_currency_id:
            return {
                "multiplier": Decimal("1.00000000"), "pair": "1:1", "fx_rate_id": None,
                "effective_date": None, "source": None, "inverted": False,
            }

        as_of = as_of or date.today()
        from_curr = self.db.get(Currency, from_currency_id)
        to_curr = self.db.get(Currency, to_currency_id)
        from_code = from_curr.code if from_curr else str(from_currency_id)
        to_code = to_curr.code if to_curr else str(to_currency_id)
        pair_str = f"{from_code}/{to_code}"

        def newest(f_id: int, t_id: int) -> Optional[FxRate]:
            return self.db.scalars(
                select(FxRate)
                .where(
                    FxRate.from_currency_id == f_id,
                    FxRate.to_currency_id == t_id,
                    FxRate.effective_date <= as_of,
                )
                .order_by(desc(FxRate.effective_date), desc(FxRate.id))
                .limit(1)
            ).first()

        direct = newest(from_currency_id, to_currency_id)
        if direct:
            return {
                "multiplier": direct.rate, "pair": pair_str, "fx_rate_id": direct.id,
                "effective_date": direct.effective_date.isoformat(), "source": direct.rate_source,
                "inverted": False,
            }

        inverse = newest(to_currency_id, from_currency_id)
        if inverse and inverse.rate > 0:
            multiplier = (Decimal("1.0") / inverse.rate).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
            return {
                "multiplier": multiplier,
                "pair": f"{pair_str} (inverted from {to_code}/{from_code})",
                "fx_rate_id": inverse.id,
                "effective_date": inverse.effective_date.isoformat(),
                "source": inverse.rate_source,
                "inverted": True,
            }

        raise MissingFxRateError(
            f"No foreign exchange rate found between {from_code} (id={from_currency_id}) and "
            f"{to_code} (id={to_currency_id}) effective on or before {as_of.isoformat()}"
        )

    # -----------------------------------------------------------------------
    # Rate Card Dimension Lookup
    # -----------------------------------------------------------------------

    def _find_rate_card(
        self,
        rate_card_version_id: int,
        pack_version_id: Optional[int],
        feature_id: Optional[int],
        country_id: Optional[int],
        tier_id: Optional[int],
        uom_id: int,
        deployment_model_id: Optional[int] = None,
        pricing_model_id: Optional[int] = None,
    ) -> Optional[RateCard]:
        """Return the single RateCard row matching the pricing dimensions, or None if there is none.

        Dimensions: version, country, deployment model, pricing model, tier, pack-or-feature, UoM.
        Country and tier are mandatory (a missing one is a configuration error, never ignored).
        Deployment and pricing model narrow the match when the proposal specifies them; if the
        remaining dimensions still match several rows the result is ambiguous and is rejected.
        """
        if country_id is None:
            raise MissingConfigurationError("Rate-card lookup requires a country")
        if tier_id is None:
            raise MissingConfigurationError("Rate-card lookup requires a customer tier")
        if (pack_version_id is None) == (feature_id is None):
            raise MissingConfigurationError("Rate-card lookup requires exactly one of pack_version_id / feature_id")

        stmt = select(RateCard).where(
            RateCard.rate_card_version_id == rate_card_version_id,
            RateCard.country_id == country_id,
            RateCard.tier_id == tier_id,
            RateCard.uom_id == uom_id,
        )
        if pack_version_id is not None:
            stmt = stmt.where(RateCard.pack_version_id == pack_version_id)
        else:
            stmt = stmt.where(RateCard.feature_id == feature_id)
        if deployment_model_id is not None:
            stmt = stmt.where(RateCard.deployment_model_id == deployment_model_id)
        if pricing_model_id is not None:
            stmt = stmt.where(RateCard.pricing_model_id == pricing_model_id)

        matches = self.db.scalars(stmt).all()
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise AmbiguousRateCardMatchError(
                f"{len(matches)} rate cards match (pack_version_id={pack_version_id}, feature_id={feature_id}, "
                f"country_id={country_id}, tier_id={tier_id}, uom_id={uom_id}, "
                f"deployment_model_id={deployment_model_id}, pricing_model_id={pricing_model_id}). "
                "Set the deployment model and pricing model on the proposal country to disambiguate."
            )

        # Fallback: if exact UOM doesn't match, check if there's an exact unique rate card ignoring uom_id
        fallback_stmt = select(RateCard).where(
            RateCard.rate_card_version_id == rate_card_version_id,
            RateCard.country_id == country_id,
            RateCard.tier_id == tier_id,
        )
        if pack_version_id is not None:
            fallback_stmt = fallback_stmt.where(RateCard.pack_version_id == pack_version_id)
        else:
            fallback_stmt = fallback_stmt.where(RateCard.feature_id == feature_id)
        if deployment_model_id is not None:
            fallback_stmt = fallback_stmt.where(RateCard.deployment_model_id == deployment_model_id)
        if pricing_model_id is not None:
            fallback_stmt = fallback_stmt.where(RateCard.pricing_model_id == pricing_model_id)

        fallback_matches = self.db.scalars(fallback_stmt).all()
        if len(fallback_matches) == 1:
            return fallback_matches[0]

        return None

    # -----------------------------------------------------------------------
    # Proposal Context Loader
    # -----------------------------------------------------------------------

    def _load_proposal_and_version(
        self,
        proposal_id: int,
        version_id: Optional[int] = None,
    ) -> Tuple[Proposal, ProposalVersion]:
        """Loads Proposal and specified or active/draft ProposalVersion."""
        stmt = (
            select(Proposal)
            .options(
                joinedload(Proposal.customer),
                joinedload(Proposal.currency),
                joinedload(Proposal.countries),
                joinedload(Proposal.versions).joinedload(ProposalVersion.line_items),
                joinedload(Proposal.versions).joinedload(ProposalVersion.service_lines),
            )
            .where(Proposal.id == proposal_id)
        )
        proposal = self.db.scalars(stmt).unique().first()
        if not proposal:
            raise ProposalNotFoundError(f"Proposal with id {proposal_id} not found")

        version = None
        if version_id:
            for v in proposal.versions:
                if v.id == version_id:
                    version = v
                    break
            if not version:
                raise ProposalNotFoundError(
                    f"ProposalVersion {version_id} does not belong to proposal {proposal_id}"
                )
        else:
            # Pick latest or draft version
            draft_versions = [v for v in proposal.versions if v.status == "draft"]
            if draft_versions:
                version = max(draft_versions, key=lambda v: v.version_no)
            elif proposal.versions:
                version = max(proposal.versions, key=lambda v: v.version_no)

        if not version:
            raise ProposalNotFoundError(f"Proposal {proposal_id} has no valid versions")

        return proposal, version

    def _resolve_primary_country_block(self, proposal: Proposal) -> Optional[ProposalCountry]:
        """Return the primary-deployment country block (or the first one added)."""
        if not proposal.countries:
            return None
        for block in proposal.countries:
            if block.is_primary_deployment:
                return block
        return min(proposal.countries, key=lambda c: c.id)

    def _resolve_primary_country(self, proposal: Proposal) -> Optional[Country]:
        """Resolves the primary deployment country from proposal countries."""
        if proposal.countries:
            for p_country in proposal.countries:
                if p_country.is_primary_deployment:
                    return p_country.country
            return proposal.countries[0].country
        return None
