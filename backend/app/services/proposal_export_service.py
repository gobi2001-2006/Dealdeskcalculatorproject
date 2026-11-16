"""Proposal Export Service for Deal Desk Commercial Calculator.

Implements high-fidelity export of approved commercial calculation values into
the official Adrenalin proposal document template (.docx) and PDF report (.pdf).

Guiding Principles:
1. Snapshot as Source of Truth: All commercial figures (FCV, platform fees,
   subscription rates, AMC, services, discounts, FX rates) are sourced directly
   from the latest successfully completed, non-stale CalculationSnapshot.
2. No Recalculation: Values are never recalculated during document generation.
3. Multi-Currency Safety: Different currencies are never summed raw. Native
   breakdowns are grouped per country/currency, and consolidated FCV totals
   always use the authoritative backend reporting-currency figures.
4. Immutability & Validation: Stale snapshots are rejected with 409 Conflict.
   Missing snapshots are rejected with 404 Not Found. Missing mandatory values
   (such as AMC % on License + AMC models) are rejected with 422 Unprocessable.
5. Professional Formatting: Populates the dedicated Commercials section in the
   official Adrenalin proposal template while preserving all subsequent legal
   and contractual terms (T&C, Payment Terms, Change Request Rates, Terms of
   Proposal).
"""

from __future__ import annotations

import io
import os
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

import docx
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Inches, Pt, RGBColor
from sqlalchemy.orm import Session

from app.models.master_data import DeploymentModel, PricingModel
from app.services.pricing_engine import PricingCalculationEngine
from app.services.proposal_service import ProposalNotFoundError, get_proposal

# Standard currency symbol lookup
CURRENCY_SYMBOLS: Dict[str, str] = {
    "INR": "₹",
    "USD": "$",
    "AED": "AED ",
    "EUR": "€",
    "GBP": "£",
    "SGD": "S$",
    "MYR": "RM ",
    "SAR": "SAR ",
    "QAR": "QAR ",
    "OMR": "OMR ",
    "KWD": "KWD ",
    "BHD": "BHD ",
}

# Adrenalin Brand Colors
COLOR_PRIMARY_NAVY = "0B1528"
COLOR_PRIMARY_ORANGE = "EA580C"
COLOR_LIGHT_BG = "F8FAFC"
COLOR_ALT_ROW = "F1F5F9"
COLOR_BORDER = "CBD5E1"
COLOR_TEXT_DARK = "0F172A"
COLOR_TEXT_MUTED = "475569"


class ProposalExportError(Exception):
    """Base error for proposal document generation."""
    pass


class NoCalculationSnapshotError(ProposalExportError):
    """Raised when no calculation snapshot exists for the proposal."""
    pass


class StaleCalculationSnapshotError(ProposalExportError):
    """Raised when the latest calculation snapshot is outdated due to proposal input changes."""
    pass


class IncompleteCommercialError(ProposalExportError):
    """Raised when mandatory commercial components (e.g. AMC % on License model) are missing."""
    pass


def format_money(value: Any, currency_code: str = "", decimals: int = 2) -> str:
    """Format numeric value with standard currency symbols and commas."""
    if value is None or value == "":
        return "—"
    try:
        num = float(value)
    except (TypeError, ValueError):
        return "—"

    symbol = CURRENCY_SYMBOLS.get((currency_code or "").upper(), f"{currency_code} " if currency_code else "")
    formatted = f"{num:,.{decimals}f}"
    return f"{symbol}{formatted}"


def format_money_pdf(value: Any, currency_code: str = "", decimals: int = 2) -> str:
    """ASCII-safe monetary formatting for PyMuPDF built-in Helvetica font."""
    if value is None or value == "":
        return "-"
    try:
        num = float(value)
    except (TypeError, ValueError):
        return "-"

    code = (currency_code or "").upper().strip()
    sign = "-" if num < 0 else ""
    prefix = f"{code} " if code else ""
    formatted = f"{abs(num):,.{decimals}f}"
    return f"{sign}{prefix}{formatted}"


def format_contract_duration(months: int) -> str:
    """Format contract duration consistently with integer months and <=2-decimal years (no trailing zeroes)."""
    m = int(months)
    years_val = round(m / 12.0, 2)
    years_str = f"{years_val:.2f}".rstrip("0").rstrip(".")
    month_label = "Month" if m == 1 else "Months"
    year_label = "Year" if years_str == "1" else "Years"
    return f"{m} {month_label} ({years_str} {year_label})"


def _format_fx_rate(fx_rate: float) -> str:
    """Format FX multiplier up to 8 decimals without trailing zeroes."""
    try:
        val = float(fx_rate)
    except (TypeError, ValueError):
        return "1"
    s = f"{val:.8f}".rstrip("0").rstrip(".")
    return s or "0"


def _infer_pricing_model_label(prod: Dict[str, Any], p_items: List[Dict[str, Any]], p_services: List[Dict[str, Any]]) -> str:
    """Resolve explicit or formula-inferred pricing model name for a product block."""
    if not p_items and p_services:
        return "Professional Services"
    explicit = (prod.get("pricing_model_name") or "").strip()
    if explicit:
        return explicit
    has_one_time = any(i.get("unit_rate_basis") == "one_time" for i in p_items)
    has_platform = any(float(i.get("platform_fee") or 0.0) > 0 for i in p_items)
    has_annual_unit = any(i.get("unit_rate_basis") == "annual" for i in p_items)
    if has_one_time:
        return "License Fee + AMC"
    if has_platform:
        return "Platform + Subscription"
    if has_annual_unit:
        return "Annual Subscription"
    return "Per Employee Per Month (PEPM)"


def _signed_money(value: float, curr: str) -> str:
    if value < 0:
        return f"−{format_money(abs(value), curr)}"
    return format_money(value, curr)


def _signed_discount_docx(value: float, curr: str) -> str:
    return f"−{format_money(abs(value), curr)}" if value > 0 else format_money(0.0, curr)


def _signed_discount_pdf(value: float, curr: str) -> str:
    return f"-{format_money_pdf(abs(value), curr)}" if value > 0 else format_money_pdf(0.0, curr)


def _build_product_calculation_details(
    prod_entry: Dict[str, Any],
    raw_prod: Dict[str, Any],
    term_months: int,
    rep_curr: str,
) -> Dict[str, Any]:
    """Build step-by-step Commercial Calculation Details directly from snapshot values."""
    n_curr = prod_entry["native_currency"]
    fx = float(prod_entry["fx_multiplier"] or 1.0)
    fx_str = _format_fx_rate(fx)
    fx_applied = (n_curr.upper() != rep_curr.upper()) or (abs(fx - 1.0) > 1e-9)

    p_items = prod_entry["line_items"]
    p_services = prod_entry["service_lines"]
    pricing_model_label = _infer_pricing_model_label(prod_entry, p_items, p_services)

    steps: List[Dict[str, Any]] = []

    def add_step(label: str, formula_docx: str, formula_pdf: str, res_docx: str, res_pdf: str, is_final: bool = False):
        steps.append({
            "label": label,
            "formula_docx": formula_docx,
            "formula_pdf": formula_pdf,
            "result_docx": res_docx,
            "result_pdf": res_pdf,
            "is_final": is_final,
        })

    # 1. Line-item subscription/license calculations
    for item in p_items:
        t_name = item.get("target_name") or "Line Item"
        basis = item.get("unit_rate_basis") or "monthly"
        fixed_basis = item.get("fixed_fee_basis") or "annual"
        qty = float(item.get("average_monthly_volume") or 0.0)
        rate = float(item.get("rate_per_unit") or 0.0)
        p_fee = float(item.get("platform_fee") or 0.0)
        contract_p_fee = float(item.get("contract_platform_fee") or 0.0)
        contract_cons = float(item.get("contract_consumption_fee") or 0.0)
        gross_item = float(
            item.get("contract_subscription_before_discount")
            if item.get("contract_subscription_before_discount") is not None
            else (contract_p_fee + contract_cons)
        )
        line_disc_pct = float(item.get("item_discount_pct") or 0.0)
        line_disc_amt = float(item.get("contract_discount_amount") or 0.0)
        net_after_line = float(
            item.get("contract_subscription_after_discount")
            if item.get("contract_subscription_after_discount") is not None
            else (gross_item - line_disc_amt)
        )
        uom_lbl = item.get("uom_name") or ("Licenses" if basis == "one_time" else "Employees")
        qty_str = f"{qty:,.0f}"
        term_years_frac = f"{term_months} / 12"

        if basis == "one_time":
            # License + AMC
            lic_fee = rate * qty
            amc_pct = float(item.get("amc_percentage") or 0.0)
            annual_amc = float(
                item.get("annual_consumption_fee")
                if item.get("annual_consumption_fee") is not None
                else (lic_fee * amc_pct / 100.0)
            )
            add_step(
                f"{t_name}: License Fee (One-Time)",
                f"License Rate × License Qty = {format_money(rate, n_curr)} × {qty_str}"
                + (f" + Fixed Fee {format_money(p_fee, n_curr)}" if p_fee > 0 else ""),
                f"License Rate x License Qty = {format_money_pdf(rate, n_curr)} x {qty_str}"
                + (f" + Fixed Fee {format_money_pdf(p_fee, n_curr)}" if p_fee > 0 else ""),
                format_money(contract_p_fee, n_curr),
                format_money_pdf(contract_p_fee, n_curr),
            )
            add_step(
                f"{t_name}: Annual AMC ({amc_pct:g}%)",
                f"Total License Fee × AMC % = {format_money(lic_fee, n_curr)} × {amc_pct:g}%",
                f"Total License Fee x AMC % = {format_money_pdf(lic_fee, n_curr)} x {amc_pct:g}%",
                f"{format_money(annual_amc, n_curr)}/yr",
                f"{format_money_pdf(annual_amc, n_curr)}/yr",
            )
            add_step(
                f"{t_name}: Contract AMC ({term_months} Mo)",
                f"Annual AMC × ({term_years_frac}) = {format_money(annual_amc, n_curr)} × ({term_years_frac})",
                f"Annual AMC x ({term_years_frac}) = {format_money_pdf(annual_amc, n_curr)} x ({term_years_frac})",
                format_money(contract_cons, n_curr),
                format_money_pdf(contract_cons, n_curr),
            )
            gross_label = "Gross License + AMC"
            add_step(
                f"{t_name}: {gross_label}",
                f"License Fee + Contract AMC = {format_money(contract_p_fee, n_curr)} + {format_money(contract_cons, n_curr)}",
                f"License Fee + Contract AMC = {format_money_pdf(contract_p_fee, n_curr)} + {format_money_pdf(contract_cons, n_curr)}",
                format_money(gross_item, n_curr),
                format_money_pdf(gross_item, n_curr),
            )
        elif p_fee > 0:
            # Platform + Subscription
            if fixed_basis == "one_time":
                plat_docx = f"One-Time Platform Fee = {format_money(p_fee, n_curr)}"
                plat_pdf = f"One-Time Platform Fee = {format_money_pdf(p_fee, n_curr)}"
            else:
                plat_docx = f"Annual Platform Fee × ({term_years_frac}) = {format_money(p_fee, n_curr)} × ({term_years_frac})"
                plat_pdf = f"Annual Platform Fee x ({term_years_frac}) = {format_money_pdf(p_fee, n_curr)} x ({term_years_frac})"
            add_step(
                f"{t_name}: Contract Platform Fee",
                plat_docx, plat_pdf,
                format_money(contract_p_fee, n_curr),
                format_money_pdf(contract_p_fee, n_curr),
            )
            if basis == "annual":
                sub_docx = f"Annual Rate × {uom_lbl} × ({term_years_frac}) = {format_money(rate, n_curr)} × {qty_str} × ({term_years_frac})"
                sub_pdf = f"Annual Rate x {uom_lbl} x ({term_years_frac}) = {format_money_pdf(rate, n_curr)} x {qty_str} x ({term_years_frac})"
            else:
                sub_docx = f"Monthly Rate × {uom_lbl} × Contract Months = {format_money(rate, n_curr)} × {qty_str} × {term_months} months"
                sub_pdf = f"Monthly Rate x {uom_lbl} x Contract Months = {format_money_pdf(rate, n_curr)} x {qty_str} x {term_months} mo"
            add_step(
                f"{t_name}: Contract Subscription",
                sub_docx, sub_pdf,
                format_money(contract_cons, n_curr),
                format_money_pdf(contract_cons, n_curr),
            )
            gross_label = "Gross Platform + Subscription"
            add_step(
                f"{t_name}: {gross_label}",
                f"Contract Platform + Subscription = {format_money(contract_p_fee, n_curr)} + {format_money(contract_cons, n_curr)}",
                f"Contract Platform + Subscription = {format_money_pdf(contract_p_fee, n_curr)} + {format_money_pdf(contract_cons, n_curr)}",
                format_money(gross_item, n_curr),
                format_money_pdf(gross_item, n_curr),
            )
        elif basis == "annual":
            gross_label = "Gross Annual Subscription"
            add_step(
                f"{t_name}: {gross_label}",
                f"Annual Rate × {uom_lbl} × ({term_years_frac}) = {format_money(rate, n_curr)} × {qty_str} × ({term_years_frac})",
                f"Annual Rate x {uom_lbl} x ({term_years_frac}) = {format_money_pdf(rate, n_curr)} x {qty_str} x ({term_years_frac})",
                format_money(gross_item, n_curr),
                format_money_pdf(gross_item, n_curr),
            )
        else:
            # PEPM
            gross_label = "Gross PEPM"
            add_step(
                f"{t_name}: {gross_label}",
                f"PEPM Rate × Employee Count × Contract Months = {format_money(rate, n_curr)} × {qty_str} × {term_months} months",
                f"PEPM Rate x Employees x Contract Months = {format_money_pdf(rate, n_curr)} x {qty_str} x {term_months} mo",
                format_money(gross_item, n_curr),
                format_money_pdf(gross_item, n_curr),
            )

        add_step(
            f"{t_name}: Line Discount ({line_disc_pct:g}%)",
            f"{gross_label} × Line Discount % = {format_money(gross_item, n_curr)} × {line_disc_pct:g}%",
            f"{gross_label} x Line Discount % = {format_money_pdf(gross_item, n_curr)} x {line_disc_pct:g}%",
            _signed_discount_docx(line_disc_amt, n_curr),
            _signed_discount_pdf(line_disc_amt, n_curr),
        )
        add_step(
            f"{t_name}: Net After Line Discount",
            f"{gross_label} − Line Discount = {format_money(gross_item, n_curr)} − {format_money(line_disc_amt, n_curr)}",
            f"{gross_label} - Line Discount = {format_money_pdf(gross_item, n_curr)} - {format_money_pdf(line_disc_amt, n_curr)}",
            format_money(net_after_line, n_curr),
            format_money_pdf(net_after_line, n_curr),
        )

    # 2. Product-level Overall Subscription Discount & Net Subscription
    contract_sub_before = float(
        raw_prod.get("contract_subscription_subtotal_before_discount")
        if raw_prod.get("contract_subscription_subtotal_before_discount") is not None
        else sum(float(i.get("contract_subscription_after_discount") or 0.0) for i in p_items)
    )
    sub_disc_pct = float(prod_entry["sub_discount_pct"] or 0.0)
    sub_disc_amt = float(prod_entry["sub_discount_amt"] or 0.0)
    contract_sub_after = float(prod_entry["contract_sub_total"] or 0.0)

    if p_items:
        if len(p_items) > 1:
            add_step(
                "Subscription Subtotal (After Line Discounts)",
                f"Sum of Net After Line Discount across {len(p_items)} line items",
                f"Sum of Net After Line Discount ({len(p_items)} line items)",
                format_money(contract_sub_before, n_curr),
                format_money_pdf(contract_sub_before, n_curr),
            )
        sub_reason = prod_entry.get("sub_discount_reason")
        sub_reason_str = f" [{sub_reason}]" if sub_reason else ""
        add_step(
            f"Overall Subscription Discount ({sub_disc_pct:g}%){sub_reason_str}",
            f"Net After Line Discount × Overall Subscription Discount % = {format_money(contract_sub_before, n_curr)} × {sub_disc_pct:g}%",
            f"Net After Line Disc. x Overall Sub Disc. % = {format_money_pdf(contract_sub_before, n_curr)} x {sub_disc_pct:g}%",
            _signed_discount_docx(sub_disc_amt, n_curr),
            _signed_discount_pdf(sub_disc_amt, n_curr),
        )
        add_step(
            f"Net Subscription ({n_curr})",
            f"Net After Line Discount − Overall Discount = {format_money(contract_sub_before, n_curr)} − {format_money(sub_disc_amt, n_curr)}",
            f"Net After Line Disc. - Overall Disc. = {format_money_pdf(contract_sub_before, n_curr)} - {format_money_pdf(sub_disc_amt, n_curr)}",
            format_money(contract_sub_after, n_curr),
            format_money_pdf(contract_sub_after, n_curr),
        )

    # 3. Professional Services steps (if any)
    serv_subtotal = float(prod_entry["serv_subtotal"] or 0.0)
    serv_disc_pct = float(prod_entry["serv_discount_pct"] or 0.0)
    serv_disc_amt = float(prod_entry["serv_discount_amt"] or 0.0)
    serv_total = float(prod_entry["serv_total"] or 0.0)

    if p_services:
        for srv in p_services:
            s_curr = srv.get("currency_code") or n_curr
            role = srv.get("role_name") or "Implementation Consultant"
            days = float(srv.get("man_days") or 0.0)
            day_r = float(srv.get("day_rate") or 0.0)
            hrs = float(srv.get("standard_hours_per_day") or 8.0)
            hr_r = float(srv.get("hourly_rate") if srv.get("hourly_rate") is not None else (day_r / hrs))
            s_tot = float(srv.get("service_line_total") or 0.0)
            add_step(
                f"Service: {role}",
                f"Man-Days × Day Rate ({format_money(hr_r, s_curr)}/hr × {hrs:g}h) = {days:g} days × {format_money(day_r, s_curr)}",
                f"Man-Days x Day Rate ({format_money_pdf(hr_r, s_curr)}/hr x {hrs:g}h) = {days:g}d x {format_money_pdf(day_r, s_curr)}",
                format_money(s_tot, s_curr),
                format_money_pdf(s_tot, s_curr),
            )
        if len(p_services) > 1:
            add_step(
                f"Gross Services Subtotal ({n_curr})",
                f"Sum of Service Line Totals ({len(p_services)} lines)",
                f"Sum of Service Line Totals ({len(p_services)} lines)",
                format_money(serv_subtotal, n_curr),
                format_money_pdf(serv_subtotal, n_curr),
            )
        serv_reason = prod_entry.get("serv_discount_reason")
        serv_reason_str = f" [{serv_reason}]" if serv_reason else ""
        add_step(
            f"Overall Service Discount ({serv_disc_pct:g}%){serv_reason_str}",
            f"Gross Services × Service Discount % = {format_money(serv_subtotal, n_curr)} × {serv_disc_pct:g}%",
            f"Gross Services x Service Discount % = {format_money_pdf(serv_subtotal, n_curr)} x {serv_disc_pct:g}%",
            _signed_discount_docx(serv_disc_amt, n_curr),
            _signed_discount_pdf(serv_disc_amt, n_curr),
        )
        add_step(
            f"Net Services ({n_curr})",
            f"Gross Services − Overall Service Discount = {format_money(serv_subtotal, n_curr)} − {format_money(serv_disc_amt, n_curr)}",
            f"Gross Services - Service Discount = {format_money_pdf(serv_subtotal, n_curr)} - {format_money_pdf(serv_disc_amt, n_curr)}",
            format_money(serv_total, n_curr),
            format_money_pdf(serv_total, n_curr),
        )

    # 4. Native Product Total -> FX Conversion -> Reporting Currency Amount & Year 1
    contract_native_total = float(prod_entry["contract_native_total"] or 0.0)
    contract_rep_total = float(prod_entry["contract_reporting_total"] or 0.0)
    annual_rep_raw = raw_prod.get("product_reporting_total")

    if p_items and p_services:
        add_step(
            f"Net Product Total ({n_curr})",
            f"Net Subscription + Net Services = {format_money(contract_sub_after, n_curr)} + {format_money(serv_total, n_curr)}",
            f"Net Subscription + Net Services = {format_money_pdf(contract_sub_after, n_curr)} + {format_money_pdf(serv_total, n_curr)}",
            format_money(contract_native_total, n_curr),
            format_money_pdf(contract_native_total, n_curr),
        )
        base_net_label = "Net Product Total"
    elif p_services:
        base_net_label = "Net Services"
    else:
        base_net_label = "Net Subscription"

    if fx_applied:
        add_step(
            f"Reporting Currency Amount ({rep_curr})",
            f"{base_net_label} × Applicable FX Rate ({n_curr} → {rep_curr}) = {format_money(contract_native_total, n_curr)} × {fx_str}",
            f"{base_net_label} x FX Rate ({n_curr}->{rep_curr}) = {format_money_pdf(contract_native_total, n_curr)} x {fx_str}",
            format_money(contract_rep_total, rep_curr),
            format_money_pdf(contract_rep_total, rep_curr),
            is_final=True,
        )
    else:
        add_step(
            f"Final Amount in Reporting Currency ({rep_curr})",
            f"{base_net_label} ({n_curr} = {rep_curr}, FX Rate = 1)",
            f"{base_net_label} ({n_curr} = {rep_curr}, FX Rate = 1)",
            format_money(contract_rep_total, rep_curr),
            format_money_pdf(contract_rep_total, rep_curr),
            is_final=True,
        )

    if annual_rep_raw is not None:
        annual_rep_val = float(annual_rep_raw)
        add_step(
            f"First-Year Value ({rep_curr})",
            "First 12 months net subscription (+ one-time charges, if any) from snapshot",
            "First 12 mo net subscription (+ one-time charges) from snapshot",
            format_money(annual_rep_val, rep_curr),
            format_money_pdf(annual_rep_val, rep_curr),
        )

    return {
        "product_name": prod_entry["product_name"],
        "product_code": prod_entry["product_code"],
        "country_name": prod_entry["country_name"],
        "country_iso": prod_entry["country_iso"],
        "native_currency": n_curr,
        "reporting_currency": rep_curr,
        "pricing_model": pricing_model_label,
        "contract_term_months": term_months,
        "contract_duration_display": format_contract_duration(term_months),
        "fx_rate": fx,
        "fx_rate_display": fx_str,
        "fx_applied": fx_applied,
        "contract_native_total": contract_native_total,
        "contract_reporting_total": contract_rep_total,
        "annual_reporting_total": float(annual_rep_raw) if annual_rep_raw is not None else None,
        "steps": steps,
    }


def get_template_path() -> str:
    """Locate the official Adrenalin proposal template document."""
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "templates", "Adrenalin_Draft_Proposal_Template_2026.docx"),
        os.path.abspath("backend/app/templates/Adrenalin_Draft_Proposal_Template_2026.docx"),
        os.path.abspath("D:/adraline/Adrenalin Draft Proposal Template 2026.docx"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    raise ProposalExportError(f"Proposal template document not found. Looked in: {candidates}")


# ---------------------------------------------------------------------------
# Data Extraction & Validation
# ---------------------------------------------------------------------------

def extract_proposal_export_data(proposal_id: int, db: Session) -> Dict[str, Any]:
    """Extract and validate the authoritative commercial values for proposal export.

    Validates:
    1. Proposal exists.
    2. Calculation snapshot exists.
    3. Calculation snapshot is not stale.
    4. Snapshot belongs to the requested proposal.
    5. Required commercial parameters (like AMC % for License+AMC) are present.
    """
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalNotFoundError(f"Proposal {proposal_id} not found")

    engine = PricingCalculationEngine(db=db)
    try:
        latest_calc = engine.get_latest_calculation(proposal_id=proposal_id)
    except Exception as exc:
        raise NoCalculationSnapshotError(
            f"No calculation snapshot found for proposal {proposal_id}. "
            "Please calculate the proposal before exporting."
        ) from exc

    if latest_calc.get("is_stale") is True:
        raise StaleCalculationSnapshotError(
            "Proposal configuration has been modified since the last calculation. "
            "Please recalculate pricing before exporting."
        )

    if latest_calc.get("proposal_id") != proposal.id:
        raise ProposalExportError("Calculation snapshot belongs to a different proposal.")

    payload = latest_calc.get("snapshot_payload") or {}
    pricing_context = payload.get("pricing_context") or {}

    reporting_currency = (
        payload.get("reporting_currency_code")
        or (proposal.currency.code if proposal.currency else "USD")
    )
    contract_term_months = int(payload.get("contract_term_months", 12))
    contract_term_years = contract_term_months / 12.0

    customer_name = proposal.customer.name if proposal.customer else "Valued Client"
    customer_tier_name = (
        proposal.customer.customer_tier.name
        if proposal.customer and proposal.customer.customer_tier
        else f"Tier {pricing_context.get('customer_tier_id', 'Standard')}"
    )

    # Compile country details safely using DB lookups for deployment/pricing models
    country_names: List[str] = []
    deployment_names: List[str] = []
    pricing_model_names: List[str] = []
    total_headcount = 0
    block_lookup: Dict[int, Dict[str, Any]] = {}

    for pc in proposal.countries:
        c_name = pc.country.name if pc.country else f"Country #{pc.country_id}"
        c_iso = pc.country.iso_code if pc.country else f"C{pc.country_id}"
        if c_name not in country_names:
            country_names.append(c_name)

        dep_name = None
        if pc.deployment_model_id:
            dep_obj = db.get(DeploymentModel, pc.deployment_model_id)
            dep_name = dep_obj.name if dep_obj else None
            if dep_name and dep_name not in deployment_names:
                deployment_names.append(dep_name)

        pm_name = None
        if pc.pricing_model_id:
            pm_obj = db.get(PricingModel, pc.pricing_model_id)
            pm_name = pm_obj.name if pm_obj else None
            if pm_name and pm_name not in pricing_model_names:
                pricing_model_names.append(pm_name)

        if pc.user_headcount:
            total_headcount += int(pc.user_headcount)

        block_lookup[pc.id] = {
            "country_name": c_name,
            "country_iso": c_iso,
            "currency_code": pc.country.currency.code if (pc.country and pc.country.currency) else None,
            "deployment_name": dep_name,
            "pricing_model_name": pm_name,
            "user_headcount": pc.user_headcount,
            "subscription_discount_pct": float(pc.subscription_discount_pct) if pc.subscription_discount_pct is not None else None,
            "subscription_discount_reason": pc.subscription_discount_reason,
            "service_discount_pct": float(pc.service_discount_pct) if pc.service_discount_pct is not None else None,
            "service_discount_reason": pc.service_discount_reason,
        }

    # Commercial Breakdown from snapshot products and line items
    products_raw = payload.get("products") or []
    all_lines = payload.get("all_subscription_line_items") or []
    all_services = payload.get("all_service_lines") or []

    # Validate non-empty commercial scope (allow zero-priced valid items; block 0-item proposals)
    has_commercial_scope = bool(
        all_lines
        or all_services
        or any((p.get("line_items") or p.get("service_lines")) for p in products_raw)
    )
    if not has_commercial_scope:
        raise IncompleteCommercialError(
            f"Proposal {proposal_id} has no commercial items. "
            "At least one valid commercial item (product, pack, feature, or service line) is required to export."
        )

    if total_headcount == 0 and all_lines:
        total_headcount = max((int(float(i.get("average_monthly_volume") or 0)) for i in all_lines), default=0)

    # Detect active commercial models and validate required fields
    has_platform_subscription = False
    has_license_amc = False
    has_pepm = False

    for item in all_lines:
        basis = item.get("unit_rate_basis")
        p_fee = float(item.get("platform_fee") or 0.0)
        amc = item.get("amc_percentage")

        if basis == "one_time":
            has_license_amc = True
            if amc is None:
                raise IncompleteCommercialError(
                    f"Line '{item.get('target_name')}' is on License + AMC pricing model but has no AMC percentage configured. "
                    "Cannot export incomplete commercial values. Please configure AMC % on Rate Card."
                )
        elif p_fee > 0:
            has_platform_subscription = True
        else:
            has_pepm = True

    # Group by country block / product accurately without mixing currencies
    countries_map: Dict[str, Dict[str, Any]] = {}
    products_commercials: List[Dict[str, Any]] = []
    calculation_details: List[Dict[str, Any]] = []

    # Aggregated Reporting-Currency Totals (converted using each product's exact FX multiplier from snapshot)
    total_license_reporting = 0.0
    total_amc_reporting = 0.0
    total_platform_reporting = 0.0
    total_sub_recurring_reporting = 0.0
    total_pepm_reporting = 0.0
    total_services_gross_reporting = 0.0
    total_discounts_reporting = 0.0

    for prod in products_raw:
        blk_id = prod.get("proposal_country_id")
        blk_info = block_lookup.get(blk_id, {})
        native_curr = prod.get("native_currency_code") or reporting_currency

        p_items = prod.get("line_items", [])
        p_services = prod.get("service_lines", [])

        # Resolve country metadata safely (supporting legacy snapshots lacking product.country_iso)
        c_name = prod.get("country_name") or blk_info.get("country_name")
        c_iso = prod.get("country_iso") or blk_info.get("country_iso")
        if not c_name or not c_iso:
            # Check child line items for embedded country fields
            for item in p_items:
                c_name = c_name or item.get("country_name")
                c_iso = c_iso or item.get("country_iso")
                if c_name and c_iso:
                    break
        if (not c_name or not c_iso) and len(block_lookup) == 1:
            sole_blk = next(iter(block_lookup.values()))
            c_name = c_name or sole_blk["country_name"]
            c_iso = c_iso or sole_blk["country_iso"]
        elif (not c_name or not c_iso) and len(block_lookup) > 1:
            matching_curr_blocks = [
                b for b in block_lookup.values()
                if b.get("currency_code") and b["currency_code"].upper() == str(native_curr).upper()
            ]
            if len(matching_curr_blocks) == 1:
                c_name = c_name or matching_curr_blocks[0]["country_name"]
                c_iso = c_iso or matching_curr_blocks[0]["country_iso"]

        if not c_name:
            c_name = "All Regions"
        # Keep c_iso as None when unresolvable so we render a clear neutral label instead of "(REG)"
        c_iso = c_iso or None

        fx = float(prod.get("fx_rate_multiplier") or 1.0)

        # Product discounts (native) — read exact authoritative contract values from snapshot
        sub_disc_pct = float(prod.get("subscription_discount_pct") or 0.0)
        sub_disc_amt = float(prod.get("subscription_discount_amount") or 0.0)
        serv_disc_pct = float(prod.get("service_discount_pct") or 0.0)
        serv_disc_amt = float(prod.get("service_discount_amount") or 0.0)
        serv_gross_native = float(prod.get("service_subtotal_before_discount") or 0.0)
        total_services_gross_reporting += serv_gross_native * fx

        contract_sub_before = (
            float(prod.get("contract_subscription_subtotal_before_discount") or 0.0)
            or sum(float(i.get("contract_subscription_after_discount") or 0.0) for i in p_items)
        )
        contract_sub_after = float(prod.get("contract_subscription_total_after_discount") or 0.0)
        if "contract_subscription_discount_amount" in prod:
            contract_sub_disc_amt = float(prod.get("contract_subscription_discount_amount") or 0.0)
        else:
            contract_sub_disc_amt = max(0.0, contract_sub_before - contract_sub_after)

        # Line-item discounts over contract
        line_disc_native = sum(float(i.get("contract_discount_amount") or 0.0) for i in p_items)
        total_prod_disc_native = line_disc_native + contract_sub_disc_amt + serv_disc_amt
        total_discounts_reporting += total_prod_disc_native * fx

        # Split item components in reporting currency
        for item in p_items:
            basis = item.get("unit_rate_basis")
            p_fee = float(item.get("platform_fee") or 0.0)
            contract_p_fee = float(item.get("contract_platform_fee") or 0.0)
            contract_cons = float(item.get("contract_consumption_fee") or 0.0)

            if basis == "one_time":
                lic_fee = float(item.get("rate_per_unit") or 0.0) * float(item.get("average_monthly_volume") or 0.0)
                total_license_reporting += lic_fee * fx
                total_amc_reporting += contract_cons * fx
            elif p_fee > 0:
                total_platform_reporting += contract_p_fee * fx
                total_sub_recurring_reporting += contract_cons * fx
            else:
                total_pepm_reporting += contract_cons * fx

        blk_info = block_lookup.get(blk_id, {})
        prod_entry = {
            "country_name": c_name,
            "country_iso": c_iso,
            "deployment_name": blk_info.get("deployment_name") or ", ".join(deployment_names),
            "pricing_model_name": blk_info.get("pricing_model_name") or ", ".join(pricing_model_names),
            "product_name": prod.get("product_name") or "Product Suite",
            "product_code": prod.get("product_code") or "PROD",
            "native_currency": native_curr,
            "fx_multiplier": fx,
            "line_items": p_items,
            "service_lines": p_services,
            "sub_subtotal": float(prod.get("subscription_subtotal_before_discount") or 0.0),
            "sub_discount_pct": sub_disc_pct,
            "sub_discount_amt": contract_sub_disc_amt if contract_sub_disc_amt > 0 else sub_disc_amt,
            "sub_discount_source": prod.get("subscription_discount_source"),
            "sub_discount_reason": prod.get("subscription_discount_reason") or blk_info.get("subscription_discount_reason"),
            "contract_sub_total": contract_sub_after,
            "serv_subtotal": float(prod.get("service_subtotal_before_discount") or 0.0),
            "serv_discount_pct": serv_disc_pct,
            "serv_discount_amt": serv_disc_amt,
            "serv_discount_source": prod.get("service_discount_source"),
            "serv_discount_reason": prod.get("service_discount_reason") or blk_info.get("service_discount_reason"),
            "serv_total": float(prod.get("service_total_after_discount") or 0.0),
            "line_disc_native": line_disc_native,
            "total_prod_disc_native": total_prod_disc_native,
            "contract_native_total": float(prod.get("contract_product_native_total") or 0.0),
            "contract_reporting_total": float(prod.get("contract_product_reporting_total") or 0.0),
        }
        products_commercials.append(prod_entry)
        calculation_details.append(
            _build_product_calculation_details(
                prod_entry=prod_entry,
                raw_prod=prod,
                term_months=contract_term_months,
                rep_curr=reporting_currency,
            )
        )

        c_key = f"{c_name}_{native_curr}"
        if c_key not in countries_map:
            countries_map[c_key] = {
                "country_name": c_name,
                "country_iso": c_iso,
                "native_currency": native_curr,
                "fx_multiplier": fx,
                "contract_native_total": 0.0,
                "contract_reporting_total": 0.0,
                "total_discount_native": 0.0,
                "products": [],
            }
        countries_map[c_key]["contract_native_total"] += prod_entry["contract_native_total"]
        countries_map[c_key]["contract_reporting_total"] += prod_entry["contract_reporting_total"]
        countries_map[c_key]["total_discount_native"] += prod_entry["total_prod_disc_native"]
        countries_map[c_key]["products"].append(prod_entry)

    # Top-level FCV and subtotals from snapshot payload (exact reporting currency)
    fcv_reporting = float(payload.get("total_proposal_contract_reporting_currency") or 0.0)
    annual_reporting = float(payload.get("total_proposal_annual_reporting_currency") or 0.0)
    sub_contract_reporting = float(payload.get("total_subscription_contract_reporting_currency") or 0.0)
    services_reporting = float(payload.get("total_services_reporting_currency") or 0.0)

    # Reconcile independently 2-decimal-rounded display components vs authoritative snapshot FCV
    total_services_gross_disp = round(total_services_gross_reporting, 2)
    total_license_disp = round(total_license_reporting, 2)
    total_amc_disp = round(total_amc_reporting, 2)
    total_platform_disp = round(total_platform_reporting, 2)
    total_sub_recurring_disp = round(total_sub_recurring_reporting, 2)
    total_pepm_disp = round(total_pepm_reporting, 2)
    total_discounts_disp = round(total_discounts_reporting, 2)

    displayed_gross_sum = 0.0
    if has_license_amc:
        displayed_gross_sum += total_license_disp + total_amc_disp
    if has_platform_subscription:
        displayed_gross_sum += total_platform_disp + total_sub_recurring_disp
    if has_pepm:
        displayed_gross_sum += total_pepm_disp
    if all_services:
        displayed_gross_sum += (total_services_gross_disp if total_discounts_disp > 0 else round(services_reporting, 2))
    displayed_net_sum = round(displayed_gross_sum - total_discounts_disp, 2)
    fx_rounding_adjustment = round(fcv_reporting - displayed_net_sum, 2)

    calc_date_str = latest_calc.get("calculated_at") or datetime.now().isoformat()
    try:
        parsed_dt = datetime.fromisoformat(calc_date_str)
        formatted_date = parsed_dt.strftime("%d %B %Y")
    except Exception:
        formatted_date = datetime.now().strftime("%d %B %Y")

    return {
        "snapshot_id": latest_calc.get("snapshot_id"),
        "proposal_id": proposal.id,
        "proposal_code": proposal.code,
        "proposal_date": formatted_date,
        "customer_name": customer_name,
        "customer_tier": customer_tier_name,
        "reporting_currency": reporting_currency,
        "contract_term_months": contract_term_months,
        "contract_term_years": contract_term_years,
        "contract_duration_display": format_contract_duration(contract_term_months),
        "total_headcount": total_headcount,
        "countries": country_names,
        "deployments": deployment_names,
        "pricing_models": pricing_model_names,
        "has_platform_subscription": has_platform_subscription,
        "has_license_amc": has_license_amc,
        "has_pepm": has_pepm,
        "all_line_items": all_lines,
        "all_service_lines": all_services,
        "products_commercials": products_commercials,
        "calculation_details": calculation_details,
        "countries_grouped": list(countries_map.values()),
        "fcv": fcv_reporting,
        "annual_fcv": annual_reporting,
        "contract_subscription_total": sub_contract_reporting,
        "total_services": services_reporting,
        "total_services_gross_reporting": total_services_gross_disp,
        "total_license_reporting": total_license_disp,
        "total_amc_reporting": total_amc_disp,
        "total_platform_reporting": total_platform_disp,
        "total_sub_recurring_reporting": total_sub_recurring_disp,
        "total_pepm_reporting": total_pepm_disp,
        "total_discounts_reporting": total_discounts_disp,
        "fx_rounding_adjustment": fx_rounding_adjustment,
        "warnings": payload.get("warnings", []),
    }


# ---------------------------------------------------------------------------
# Word Document (.docx) Generation
# ---------------------------------------------------------------------------

def _set_cell_background(cell, hex_color: str):
    """Set the background fill color of a table cell."""
    tcPr = cell._tc.get_or_add_tcPr()
    for shd in tcPr.findall(qn("w:shd")):
        tcPr.remove(shd)
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)


def _set_cell_padding(cell, top=120, bottom=120, left=150, right=150):
    """Set cell padding (in dxa: 20 dxa = 1 pt)."""
    tcPr = cell._tc.get_or_add_tcPr()
    for mar in tcPr.findall(qn("w:tcMar")):
        tcPr.remove(mar)
    mar_xml = (
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(parse_xml(mar_xml))


def _set_table_borders(table, border_color: str = COLOR_BORDER):
    """Set clean horizontal borders for a commercial table."""
    tblPr = table._tbl.tblPr
    for b in tblPr.findall(qn("w:tblBorders")):
        tblPr.remove(b)
    borders_xml = (
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>'
        f'<w:left w:val="none"/>'
        f'<w:bottom w:val="single" w:sz="8" w:space="0" w:color="{border_color}"/>'
        f'<w:right w:val="none"/>'
        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>'
        f'<w:insideV w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(parse_xml(borders_xml))


def _add_styled_row(
    table,
    texts: List[str],
    is_header: bool = False,
    is_total: bool = False,
    is_fcv: bool = False,
    aligns: Optional[List[WD_ALIGN_PARAGRAPH]] = None,
):
    """Add a styled row to a Word table."""
    row = table.add_row()
    if is_header:
        trPr = row._tr.get_or_add_trPr()
        trPr.append(OxmlElement("w:tblHeader"))

    for idx, text_val in enumerate(texts):
        cell = row.cells[idx]
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        _set_cell_padding(cell, top=140 if (is_header or is_fcv) else 100, bottom=140 if (is_header or is_fcv) else 100)

        if is_header:
            _set_cell_background(cell, COLOR_PRIMARY_NAVY)
        elif is_fcv:
            _set_cell_background(cell, "FFF7ED")  # Subtle orange highlight for FCV row
        elif is_total:
            _set_cell_background(cell, COLOR_ALT_ROW)

        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        p.alignment = aligns[idx] if aligns and idx < len(aligns) else WD_ALIGN_PARAGRAPH.LEFT

        run = p.add_run(str(text_val))
        run.font.name = "Calibri"
        if is_header:
            run.font.bold = True
            run.font.color.rgb = RGBColor(255, 255, 255)
            run.font.size = Pt(9.5)
        elif is_fcv:
            run.font.bold = True
            run.font.color.rgb = RGBColor(194, 65, 12) if idx == len(texts) - 1 else RGBColor(11, 21, 40)
            run.font.size = Pt(10.5)
        elif is_total:
            run.font.bold = True
            run.font.color.rgb = RGBColor(11, 21, 40)
            run.font.size = Pt(9.5)
        else:
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(15, 23, 42)


def _replace_placeholder_in_paragraph_el(p_el, old_str: str, new_str: str):
    """Replace placeholder occurrences inside any XML <w:p>, preserving run formatting."""
    if not old_str or not new_str or old_str == new_str:
        return
    t_elems = list(p_el.iter(qn("w:t")))
    if not t_elems:
        return
    joined = "".join(t.text or "" for t in t_elems)
    if old_str not in joined:
        return
    # Replace whole-run occurrences first to preserve run properties cleanly
    for t_el in t_elems:
        if t_el.text and old_str in t_el.text:
            t_el.text = t_el.text.replace(old_str, new_str)
    # Handle placeholders split across consecutive runs inside the same paragraph/hyperlink
    search_from = 0
    while True:
        joined = "".join(t.text or "" for t in t_elems)
        idx = joined.find(old_str, search_from)
        if idx == -1:
            break
        end_idx = idx + len(old_str)
        pos = 0
        placed = False
        for t_el in t_elems:
            txt = t_el.text or ""
            t_start, t_end = pos, pos + len(txt)
            pos = t_end
            if t_end <= idx or t_start >= end_idx:
                continue
            before = txt[: max(0, idx - t_start)]
            after = txt[max(0, end_idx - t_start) :]
            if not placed:
                t_el.text = before + new_str + after
                placed = True
            else:
                t_el.text = after
        search_from = idx + len(new_str)


def _replace_placeholder_everywhere(doc: docx.document.Document, old_str: str, new_str: str):
    """Replace placeholder across body paragraphs, tables, nested tables, TOC/SDT, textboxes, and headers/footers."""
    if not old_str or not new_str or old_str == new_str:
        return
    roots = [doc.element.body]
    seen_roots = {doc.element.body}
    for section in doc.sections:
        for hf in (
            section.header,
            section.footer,
            section.first_page_header,
            section.first_page_footer,
            section.even_page_header,
            section.even_page_footer,
        ):
            if hf is not None and hf._element is not None and hf._element not in seen_roots:
                seen_roots.add(hf._element)
                roots.append(hf._element)
    for root in roots:
        for p_el in root.iter(qn("w:p")):
            _replace_placeholder_in_paragraph_el(p_el, old_str, new_str)


def _populate_proposal_content_sections(
    doc: docx.Document,
    data: Dict[str, Any],
    proposal_id: int,
    db: Session,
) -> None:
    """Inject user-edited proposal content sections, tables, and attachments into DOCX template."""
    from app.services.proposal_workflow_service import get_proposal_content_sections

    try:
        content_info = get_proposal_content_sections(proposal_id=proposal_id, db=db)
        sections = content_info.get("sections") or {}
        attachments = content_info.get("attachments") or []
    except Exception as exc:
        logger.warning(f"Unable to load content sections for export: {exc}")
        return

    customer_name = data.get("customer_name") or "Customer"
    rep_curr = data.get("reporting_currency") or "INR"
    total_services = float(data.get("total_services") or 0.0)

    def insert_after(
        target_p: Any,
        text: str = "",
        bold: bool = False,
        space_before: int = 2,
        space_after: int = 3,
        font_size: float = 9.5,
        color_rgb: Optional[RGBColor] = None,
    ) -> Any:
        p = doc.add_paragraph("")
        target_p._element.addnext(p._element)
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after = Pt(space_after)
        if text:
            r = p.add_run(text)
            r.font.name = "Calibri"
            r.font.bold = bold
            r.font.size = Pt(font_size)
            if color_rgb:
                r.font.color.rgb = color_rgb
        return p

    def find_p(startswith_text: str) -> Optional[Any]:
        for p in doc.paragraphs:
            if p.text.strip().startswith(startswith_text):
                return p
        return None

    # 1. Executive Summary
    exec_c = sections.get("executive_summary")
    if exec_c:
        p_exec = find_p("Executive Summary")
        if p_exec:
            curr_p = p_exec
            if isinstance(exec_c, dict):
                intro = exec_c.get("customer_introduction")
                if intro:
                    curr_p = insert_after(curr_p, intro, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

                p_obj = find_p(f"{customer_name}’S Objectives:") or find_p("Objectives:") or curr_p
                curr_p = p_obj
                obj = exec_c.get("customer_objectives")
                if obj:
                    curr_p = insert_after(curr_p, obj, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

                val_prop = exec_c.get("value_proposition")
                if val_prop:
                    curr_p = insert_after(curr_p, "Value Proposition & Strategic Alignment", bold=True, font_size=11.0, color_rgb=RGBColor(11, 21, 40))
                    curr_p = insert_after(curr_p, val_prop, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

                conc = exec_c.get("conclusion")
                if conc:
                    curr_p = insert_after(curr_p, "Executive Conclusion", bold=True, font_size=11.0, color_rgb=RGBColor(11, 21, 40))
                    curr_p = insert_after(curr_p, conc, font_size=9.5, color_rgb=RGBColor(51, 65, 85))
            elif isinstance(exec_c, str) and exec_c.strip():
                insert_after(curr_p, exec_c.strip(), font_size=9.5, color_rgb=RGBColor(51, 65, 85))

    # 2. Scope of Work
    sow_c = sections.get("scope_of_work")
    if sow_c:
        if isinstance(sow_c, dict):
            lic = sow_c.get("license")
            if lic:
                p_lic = find_p("License Scope considered in this proposal:")
                if p_lic:
                    insert_after(p_lic, lic, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

            plan = sow_c.get("implementation_plan")
            p_plan = find_p("Implementation Scope considered in this proposal")
            if p_plan:
                curr_p = p_plan
                if plan:
                    curr_p = insert_after(curr_p, plan, font_size=9.5, color_rgb=RGBColor(51, 65, 85))
                appr = sow_c.get("implementation_approach")
                if appr:
                    curr_p = insert_after(curr_p, "Implementation Approach & Governance:", bold=True, font_size=10.0, color_rgb=RGBColor(11, 21, 40))
                    curr_p = insert_after(curr_p, appr, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

            # In Scope Table (Table 3)
            in_scope_text = sow_c.get("in_scope")
            if in_scope_text and len(doc.tables) > 3:
                t3 = doc.tables[3]
                lines = [l.strip().lstrip("-*•1234567890. ") for l in in_scope_text.split("\n") if l.strip()]
                if lines:
                    while len(t3.rows) > 1:
                        t3._element.remove(t3.rows[-1]._element)
                    for idx, line in enumerate(lines, 1):
                        r = t3.add_row()
                        if len(r.cells) >= 2:
                            r.cells[0].text = str(idx)
                            r.cells[1].text = line

            # Out of Scope Table (Table 4)
            out_scope_text = sow_c.get("out_of_scope")
            if out_scope_text and len(doc.tables) > 4:
                t4 = doc.tables[4]
                lines = [l.strip().lstrip("-*•1234567890. ") for l in out_scope_text.split("\n") if l.strip()]
                if lines:
                    while len(t4.rows) > 1:
                        t4._element.remove(t4.rows[-1]._element)
                    for idx, line in enumerate(lines, 1):
                        r = t4.add_row()
                        if len(r.cells) >= 2:
                            r.cells[0].text = str(idx)
                            r.cells[1].text = line
        elif isinstance(sow_c, str) and sow_c.strip():
            p_lic = find_p("License Scope considered in this proposal:")
            if p_lic:
                insert_after(p_lic, sow_c.strip(), font_size=9.5, color_rgb=RGBColor(51, 65, 85))

    # 3. Customization & Integration (Tables 5 and 6)
    ci_c = sections.get("customization_integration")
    if ci_c and isinstance(ci_c, dict):
        none_req = bool(ci_c.get("none_required"))
        items = ci_c.get("items") or []

        # Table 5: Customizations
        if len(doc.tables) > 5:
            t5 = doc.tables[5]
            cust_items = [i for i in items if i.get("type") == "Customization"]
            while len(t5.rows) > 1:
                t5._element.remove(t5.rows[-1]._element)
            if none_req or not cust_items:
                r = t5.add_row()
                if len(r.cells) >= 5:
                    r.cells[0].text = "—"
                    r.cells[1].text = "All Modules"
                    r.cells[2].text = "Standard"
                    r.cells[3].text = "No customizations required"
                    r.cells[4].text = "Standard product features address all defined requirements."
            else:
                for idx, item in enumerate(cust_items, 1):
                    r = t5.add_row()
                    if len(r.cells) >= 5:
                        r.cells[0].text = str(idx)
                        r.cells[1].text = item.get("system") or "Core HCM"
                        r.cells[2].text = item.get("module") or "General"
                        r.cells[3].text = item.get("title") or "Custom Workflow"
                        charge_str = "Chargeable" if item.get("chargeable") else "Non-Chargeable"
                        effort = item.get("effort_days") or 0
                        desc = item.get("description") or ""
                        r.cells[4].text = f"{desc} ({effort} days, {charge_str})".strip()

        # Table 6: Integrations
        if len(doc.tables) > 6:
            t6 = doc.tables[6]
            integ_items = [i for i in items if i.get("type") == "Integration"]
            while len(t6.rows) > 1:
                t6._element.remove(t6.rows[-1]._element)
            if none_req or not integ_items:
                r = t6.add_row()
                if len(r.cells) >= 5:
                    r.cells[0].text = "—"
                    r.cells[1].text = "All Modules"
                    r.cells[2].text = "Standard"
                    r.cells[3].text = "No system integrations required"
                    r.cells[4].text = "Standard platform connectors and APIs available."
            else:
                for idx, item in enumerate(integ_items, 1):
                    r = t6.add_row()
                    if len(r.cells) >= 5:
                        r.cells[0].text = str(idx)
                        r.cells[1].text = item.get("system") or "External System"
                        r.cells[2].text = item.get("module") or "API Connector"
                        r.cells[3].text = item.get("title") or "System Integration"
                        charge_str = "Chargeable" if item.get("chargeable") else "Non-Chargeable"
                        effort = item.get("effort_days") or 0
                        desc = item.get("description") or ""
                        r.cells[4].text = f"{desc} ({effort} days, {charge_str})".strip()

    # 4. Terms & Conditions
    tc_c = sections.get("terms_conditions")
    if tc_c and isinstance(tc_c, dict):
        comm_tc = tc_c.get("commercial_tc")
        if comm_tc:
            p_comm_tc = find_p("T&C for above Commercials:")
            if p_comm_tc:
                insert_after(p_comm_tc, comm_tc, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

        # Change Request Rates (Table 7)
        cr_rates = tc_c.get("change_request_rates") or []
        if cr_rates and len(doc.tables) > 7:
            t7 = doc.tables[7]
            while len(t7.rows) > 1:
                t7._element.remove(t7.rows[-1]._element)
            for cr in cr_rates:
                r = t7.add_row()
                if len(r.cells) >= 3:
                    role = cr.get("role") or "Consultant"
                    rate = float(cr.get("rate_per_day") or 0.0)
                    curr = cr.get("currency") or rep_curr
                    r.cells[0].text = role
                    r.cells[1].text = f"{format_money(rate, curr)} / Day"
                    r.cells[2].text = f"{format_money(rate * 0.85, curr)} / Day"

        # Payment Milestones Table under 'Payment Terms'
        milestones = tc_c.get("payment_milestones") or []
        p_pay = find_p("Payment Terms")
        if p_pay:
            curr_p = p_pay
            if milestones:
                tbl = doc.add_table(rows=0, cols=3)
                tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
                _set_table_borders(tbl)
                curr_p._element.addnext(tbl._element)
                col_widths = [3.5, 1.5, 2.0]
                for i, w in enumerate(col_widths):
                    for cell in tbl.columns[i].cells:
                        cell.width = Inches(w)
                _add_styled_row(
                    tbl,
                    ["Implementation Milestone / Deliverable", "Fee %", f"Amount ({rep_curr})"],
                    is_header=True,
                    aligns=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT],
                )
                for m in milestones:
                    pct = float(m.get("percentage") or 0.0)
                    amt = total_services * (pct / 100.0)
                    _add_styled_row(
                        tbl,
                        [m.get("milestone") or "Milestone", f"{pct:g}%", format_money(amt, rep_curr)],
                        aligns=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT],
                    )
            pay_text = tc_c.get("payment_terms_text")
            if pay_text:
                insert_after(p_pay, pay_text, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

        # Proposal Validity & Terms of Proposal
        p_prop = find_p("Terms of Proposal")
        if p_prop:
            curr_p = p_prop
            val_days = tc_c.get("proposal_validity_days") if tc_c.get("proposal_validity_days") is not None else 0
            curr_p = insert_after(
                curr_p,
                f"Proposal Validity: This commercial proposal and associated software licensing terms are valid for {val_days} calendar days from the date of issuance.",
                bold=True,
                font_size=9.5,
                color_rgb=RGBColor(180, 83, 9),
            )
            terms_txt = tc_c.get("terms_of_proposal")
            if terms_txt:
                insert_after(curr_p, terms_txt, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

    # 5. Fitment Document (Annexure 1)
    fit_c = sections.get("fitment_document")
    p_fit = find_p("Annexure 1 – Product Fitment Document")
    if p_fit:
        curr_p = p_fit
        if fit_c and isinstance(fit_c, dict):
            fit_text = fit_c.get("fitment_text")
            if fit_text:
                curr_p = insert_after(curr_p, fit_text, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

            reqs = fit_c.get("customer_requirements")
            if reqs:
                curr_p = insert_after(curr_p, "Customer Specific Requirements Evaluation:", bold=True, font_size=10.0, color_rgb=RGBColor(11, 21, 40))
                curr_p = insert_after(curr_p, reqs, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

            sol = fit_c.get("solution_fitment")
            if sol:
                curr_p = insert_after(curr_p, "Adrenalin Solution Fitment & Gap Analysis:", bold=True, font_size=10.0, color_rgb=RGBColor(11, 21, 40))
                curr_p = insert_after(curr_p, sol, font_size=9.5, color_rgb=RGBColor(51, 65, 85))

            rem = fit_c.get("remarks")
            if rem:
                curr_p = insert_after(curr_p, "Fitment Remarks & Technical Assumptions:", bold=True, font_size=10.0, color_rgb=RGBColor(11, 21, 40))
                curr_p = insert_after(curr_p, rem, font_size=9.5, color_rgb=RGBColor(51, 65, 85))
        elif isinstance(fit_c, str) and fit_c.strip():
            curr_p = insert_after(curr_p, fit_c.strip(), font_size=9.5, color_rgb=RGBColor(51, 65, 85))

        # Insert Attachments table if attachments exist
        if attachments:
            curr_p = insert_after(curr_p, "Attached RFP Compliance & Technical Fitment Documentation:", bold=True, font_size=10.0, color_rgb=RGBColor(11, 21, 40))
            att_tbl = doc.add_table(rows=0, cols=4)
            att_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
            _set_table_borders(att_tbl)
            curr_p._element.addnext(att_tbl._element)
            _add_styled_row(
                att_tbl,
                ["#", "Attachment Document Name", "File Size (KB)", "Format / Status"],
                is_header=True,
                aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.CENTER],
            )
            for idx, att in enumerate(attachments, 1):
                size_kb = (att.get("file_size_bytes") or 0) / 1024.0
                _add_styled_row(
                    att_tbl,
                    [str(idx), att.get("file_name") or "Attachment", f"{size_kb:,.1f} KB", att.get("status") or "uploaded"],
                    aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.CENTER],
                )


def generate_proposal_docx(
    proposal_id: int,
    db: Session,
    _preloaded_data: Optional[Dict[str, Any]] = None,
) -> io.BytesIO:
    """Generate the complete customized Adrenalin proposal document (.docx)."""
    data = _preloaded_data or extract_proposal_export_data(proposal_id=proposal_id, db=db)
    template_path = get_template_path()
    doc = docx.Document(template_path)

    customer_name = data["customer_name"]

    # 1. Personalize customer placeholder throughout paragraphs, tables, nested tables, and headers/footers
    if customer_name and customer_name.strip():
        _replace_placeholder_everywhere(doc, "XXX", customer_name.strip())

    # 2. Populate Proposal Summary Table (Table 1) if present
    if len(doc.tables) > 1:
        scope_table = doc.tables[1]
        for row in scope_table.rows:
            label = row.cells[0].text.strip()
            if "Company Name" in label:
                row.cells[1].text = customer_name
            elif "Deployment Model" in label:
                row.cells[1].text = ", ".join(data["deployments"]) or "Shared Cloud"
            elif "Territory" in label:
                row.cells[1].text = ", ".join(data["countries"]) or "Standard Territory"
            elif "Number of Active Employee Record Licenses" in label:
                row.cells[1].text = f"{data['total_headcount']:,}" if data["total_headcount"] > 0 else "Per Schedule"

    # 3. Locate Commercials insertion point (just before 'T&C for above Commercials')
    target_p = None
    for p in doc.paragraphs:
        if p.text.strip().startswith("T&C for above Commercials"):
            target_p = p
            break
    if not target_p:
        target_p = doc.paragraphs[-1]

    def insert_p(
        text: str = "",
        bold: bool = False,
        space_before: int = 3,
        space_after: int = 4,
        font_size: float = 9.5,
        color_rgb: Optional[RGBColor] = None,
    ) -> Any:
        p = target_p.insert_paragraph_before("")
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after = Pt(space_after)
        if text:
            r = p.add_run(text)
            r.font.name = "Calibri"
            r.font.bold = bold
            r.font.size = Pt(font_size)
            if color_rgb:
                r.font.color.rgb = color_rgb
        return p

    def insert_table(cols: int, col_widths: List[float]) -> Any:
        tbl = doc.add_table(rows=0, cols=cols)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        _set_table_borders(tbl)
        target_p._element.addprevious(tbl._element)
        for i, width in enumerate(col_widths):
            for cell in tbl.columns[i].cells:
                cell.width = Inches(width)
        return tbl

    rep_curr = data["reporting_currency"]
    term_m = data["contract_term_months"]
    term_y = data["contract_term_years"]

    # -------------------------------------------------------------------------
    # A. Proposal Commercial Overview Table
    # -------------------------------------------------------------------------
    insert_p(
        "Commercial Proposal Overview & Contract Parameters",
        bold=True, space_before=6, space_after=4, font_size=12.5, color_rgb=RGBColor(234, 88, 12),
    )
    insert_p(
        f"Commercial summary prepared for {customer_name} (Ref: {data['proposal_code']}). All prices are retrieved "
        f"from approved calculation snapshot #{data['snapshot_id']}.",
        space_after=6, font_size=9.0, color_rgb=RGBColor(71, 85, 105),
    )

    info_tbl = insert_table(cols=4, col_widths=[1.6, 2.0, 1.6, 2.0])
    _add_styled_row(info_tbl, ["Parameter", "Value", "Parameter", "Value"], is_header=True)
    _add_styled_row(info_tbl, ["Customer Name", customer_name, "Proposal Reference", data["proposal_code"]])
    _add_styled_row(info_tbl, ["Proposal Date", data["proposal_date"], "Reporting Currency", rep_curr])
    _add_styled_row(info_tbl, ["Countries Covered", ", ".join(data["countries"]), "Customer Tier", data["customer_tier"]])
    _add_styled_row(info_tbl, ["Deployment Model", ", ".join(data["deployments"]), "Contract Duration", data["contract_duration_display"]])
    _add_styled_row(info_tbl, ["Pricing Model(s)", ", ".join(data["pricing_models"]), "Licensed Employees", f"{data['total_headcount']:,}"])

    insert_p(space_after=6)

    # -------------------------------------------------------------------------
    # B. Per-Country & Per-Model Commercial Breakdown
    # -------------------------------------------------------------------------
    is_multi_country = len(data["countries_grouped"]) > 1

    for country_grp in data["countries_grouped"]:
        c_name = country_grp["country_name"]
        n_curr = country_grp["native_currency"]

        if is_multi_country:
            insert_p(
                f"Country Scope: {c_name} ({n_curr})",
                bold=True, space_before=6, space_after=3, font_size=11.5, color_rgb=RGBColor(11, 21, 40),
            )

        for prod in country_grp["products"]:
            p_items = prod["line_items"]
            if not p_items:
                continue

            # Split items by model type for clean rendering
            model_a_items = [i for i in p_items if i.get("unit_rate_basis") != "one_time" and float(i.get("platform_fee") or 0) > 0]
            model_b_items = [i for i in p_items if i.get("unit_rate_basis") == "one_time"]
            model_c_items = [i for i in p_items if i.get("unit_rate_basis") != "one_time" and float(i.get("platform_fee") or 0) == 0]

            # Model A: Platform + Subscription
            if model_a_items:
                insert_p(
                    f"Platform + Subscription — {prod['product_name']} ({n_curr})",
                    bold=True, space_before=4, space_after=3, font_size=10.5, color_rgb=RGBColor(15, 23, 42),
                )
                aligns_a = [
                    WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.RIGHT,
                    WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT
                ]
                tbl_a = insert_table(cols=7, col_widths=[2.0, 0.9, 0.8, 1.0, 1.0, 1.0, 1.1])
                _add_styled_row(
                    tbl_a,
                    ["Package / Feature", "UOM", "Employees", "Annual Platform", "Sub Rate/Mo", "Platform (Term)", "Subscription (Term)"],
                    is_header=True, aligns=aligns_a,
                )
                for item in model_a_items:
                    _add_styled_row(
                        tbl_a,
                        [
                            item.get("target_name") or "Module",
                            item.get("uom_name") or "Users",
                            f"{float(item.get('average_monthly_volume') or 0):,.0f}",
                            format_money(item.get("platform_fee"), n_curr),
                            format_money(item.get("rate_per_unit"), n_curr),
                            format_money(item.get("contract_platform_fee"), n_curr),
                            format_money(item.get("contract_consumption_fee"), n_curr),
                        ],
                        aligns=aligns_a,
                    )
                _add_styled_row(
                    tbl_a,
                    [
                        f"Net Subscription Total ({n_curr})", "—", "—", "—", "—", "—",
                        format_money(prod["contract_sub_total"], n_curr),
                    ],
                    is_total=True, aligns=aligns_a,
                )
                insert_p(space_after=5)

            # Model B: License + AMC
            if model_b_items:
                insert_p(
                    f"License Fee + AMC — {prod['product_name']} ({n_curr})",
                    bold=True, space_before=4, space_after=3, font_size=10.5, color_rgb=RGBColor(15, 23, 42),
                )
                aligns_b = [
                    WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT,
                    WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT
                ]
                tbl_b = insert_table(cols=7, col_widths=[2.0, 0.8, 1.0, 1.1, 0.7, 1.0, 1.2])
                _add_styled_row(
                    tbl_b,
                    ["License Module", "Qty", "License Rate", "Total License Fee", "AMC %", "Annual AMC", f"Total AMC ({term_m} Mo)"],
                    is_header=True, aligns=aligns_b,
                )
                for item in model_b_items:
                    qty = float(item.get("average_monthly_volume") or 0.0)
                    rate = float(item.get("rate_per_unit") or 0.0)
                    lic_fee = qty * rate
                    amc_pct = float(item.get("amc_percentage") or 0.0)
                    ann_amc = float(item.get("annual_consumption_fee") or (lic_fee * amc_pct / 100.0))
                    con_amc = float(item.get("contract_consumption_fee") or 0.0)
                    _add_styled_row(
                        tbl_b,
                        [
                            item.get("target_name") or "License",
                            f"{qty:,.0f}",
                            format_money(rate, n_curr),
                            format_money(lic_fee, n_curr),
                            f"{amc_pct:g}%",
                            format_money(ann_amc, n_curr),
                            format_money(con_amc, n_curr),
                        ],
                        aligns=aligns_b,
                    )
                _add_styled_row(
                    tbl_b,
                    [f"Net License + AMC Total ({n_curr})", "—", "—", "—", "—", "—", format_money(prod["contract_sub_total"], n_curr)],
                    is_total=True, aligns=aligns_b,
                )
                insert_p(space_after=5)

            # Model C: PEPM
            if model_c_items:
                insert_p(
                    f"Per Employee Per Month (PEPM) — {prod['product_name']} ({n_curr})",
                    bold=True, space_before=4, space_after=3, font_size=10.5, color_rgb=RGBColor(15, 23, 42),
                )
                aligns_c = [
                    WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.RIGHT,
                    WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.RIGHT
                ]
                tbl_c = insert_table(cols=6, col_widths=[2.3, 1.0, 1.0, 1.0, 0.9, 1.4])
                _add_styled_row(
                    tbl_c,
                    ["Subscription Scope", "UOM", "Employees", "PEPM Rate", "Duration", f"Total PEPM ({term_m} Mo)"],
                    is_header=True, aligns=aligns_c,
                )
                for item in model_c_items:
                    _add_styled_row(
                        tbl_c,
                        [
                            item.get("target_name") or "PEPM Module",
                            item.get("uom_name") or "Employees",
                            f"{float(item.get('average_monthly_volume') or 0):,.0f}",
                            format_money(item.get("rate_per_unit"), n_curr),
                            f"{term_m} Months",
                            format_money(item.get("contract_consumption_fee"), n_curr),
                        ],
                        aligns=aligns_c,
                    )
                _add_styled_row(
                    tbl_c,
                    [f"Net PEPM Subscription ({n_curr})", "—", "—", "—", "—", format_money(prod["contract_sub_total"], n_curr)],
                    is_total=True, aligns=aligns_c,
                )
                insert_p(space_after=5)

    # -------------------------------------------------------------------------
    # C. Professional Services Table
    # -------------------------------------------------------------------------
    if data["all_service_lines"]:
        insert_p(
            "Professional Services & Implementation Breakdown",
            bold=True, space_before=6, space_after=3, font_size=11.0, color_rgb=RGBColor(11, 21, 40),
        )
        srv_aligns = [WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT]
        srv_tbl = insert_table(cols=4, col_widths=[3.2, 1.1, 1.5, 1.6])
        _add_styled_row(srv_tbl, ["Service Description / Role", "Man-Days", "Hourly / Daily Rate", "Total Service Amount"], is_header=True, aligns=srv_aligns)

        for srv in data["all_service_lines"]:
            curr = srv.get("currency_code") or rep_curr
            day_rate = float(srv.get("day_rate") or 0.0)
            hourly_rate = day_rate / 8.0
            _add_styled_row(
                srv_tbl,
                [
                    srv.get("role_name") or "Implementation Consultant",
                    f"{float(srv.get('man_days') or 0):g} Days",
                    f"{format_money(hourly_rate, curr)}/hr ({format_money(day_rate, curr)}/day)",
                    format_money(srv.get("service_line_total"), curr),
                ],
                aligns=srv_aligns,
            )

        _add_styled_row(
            srv_tbl,
            [f"Total Net Professional Services ({rep_curr})", "—", "—", format_money(data["total_services"], rep_curr)],
            is_total=True, aligns=srv_aligns,
        )
        insert_p(space_after=6)

    # -------------------------------------------------------------------------
    # D. Discounts Schedule (Line-Item, Overall Subscription, Overall Service)
    # -------------------------------------------------------------------------
    has_any_discount = any(
        p["total_prod_disc_native"] > 0 for p in data["products_commercials"]
    )
    if has_any_discount:
        insert_p(
            "Approved Commercial Discounts Schedule",
            bold=True, space_before=6, space_after=3, font_size=11.0, color_rgb=RGBColor(11, 21, 40),
        )
        disc_aligns = [WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.RIGHT]
        disc_tbl = insert_table(cols=4, col_widths=[2.8, 1.6, 1.2, 1.8])
        _add_styled_row(disc_tbl, ["Discount Component", "Country / Product", "Discount %", "Discount Amount"], is_header=True, aligns=disc_aligns)

        for p in data["products_commercials"]:
            n_curr = p["native_currency"]
            country_product_lbl = (
                f"{p['product_name']} ({p['country_iso']})"
                if p.get("country_iso")
                else f"{p['product_name']} ({n_curr})"
            )
            line_country_lbl = (
                f"{p['country_name']} ({n_curr})"
                if p.get("country_name") and p["country_name"] != "All Regions"
                else country_product_lbl
            )
            for item in p["line_items"]:
                if float(item.get("item_discount_pct") or 0) > 0:
                    _add_styled_row(
                        disc_tbl,
                        [
                            f"Line Discount: {item.get('target_name')}",
                            line_country_lbl,
                            f"{float(item.get('item_discount_pct')):g}%",
                            format_money(item.get("contract_discount_amount"), n_curr),
                        ],
                        aligns=disc_aligns,
                    )
            if p["sub_discount_pct"] > 0:
                _add_styled_row(
                    disc_tbl,
                    [
                        "Overall Subscription Discount",
                        country_product_lbl,
                        f"{p['sub_discount_pct']:g}%",
                        format_money(p["sub_discount_amt"], n_curr),
                    ],
                    aligns=disc_aligns,
                )
            if p["serv_discount_pct"] > 0:
                _add_styled_row(
                    disc_tbl,
                    [
                        "Overall Professional Services Discount",
                        country_product_lbl,
                        f"{p['serv_discount_pct']:g}%",
                        format_money(p["serv_discount_amt"], n_curr),
                    ],
                    aligns=disc_aligns,
                )

        insert_p(space_after=6)

    # -------------------------------------------------------------------------
    # D2. Commercial Calculation Details (Formula-by-Formula Snapshot Trace)
    # -------------------------------------------------------------------------
    calc_details = data.get("calculation_details") or []
    if calc_details:
        insert_p(
            "Commercial Calculation Details",
            bold=True, space_before=6, space_after=3, font_size=12.5, color_rgb=RGBColor(234, 88, 12),
        )
        insert_p(
            "Step-by-step calculation breakdown from the approved pricing snapshot, showing unit rates, "
            "contract duration, applicable discounts, and currency conversions prior to final rounding.",
            space_after=5, font_size=9.0, color_rgb=RGBColor(71, 85, 105),
        )

        calc_aligns = [WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT]
        for detail in calc_details:
            n_curr = detail["native_currency"]
            c_label = (
                f"{detail['country_name']} ({n_curr})"
                if detail.get("country_name") and detail["country_name"] != "All Regions"
                else f"Region / Currency: {n_curr}"
            )
            insert_p(
                f"{detail['product_name']} — {detail['pricing_model']} ({c_label})",
                bold=True, space_before=4, space_after=2, font_size=10.5, color_rgb=RGBColor(15, 23, 42),
            )
            meta_parts = [
                f"Pricing Model: {detail['pricing_model']}",
                f"Country & Currency: {c_label}",
                f"Contract Duration: {detail['contract_duration_display']}",
            ]
            if detail.get("fx_applied"):
                meta_parts.append(
                    f"FX Rate ({n_curr} → {detail['reporting_currency']}): {detail['fx_rate_display']}"
                )
            else:
                meta_parts.append(f"Reporting Currency: {detail['reporting_currency']} (No FX Conversion)")

            insert_p(
                "  |  ".join(meta_parts),
                space_after=3, font_size=8.5, color_rgb=RGBColor(71, 85, 105),
            )

            calc_tbl = insert_table(cols=3, col_widths=[2.0, 3.8, 1.6])
            _add_styled_row(
                calc_tbl,
                ["Calculation Step", "Formula & Snapshot Inputs", "Calculated Amount"],
                is_header=True,
                aligns=calc_aligns,
            )
            for step in detail["steps"]:
                _add_styled_row(
                    calc_tbl,
                    [step["label"], step["formula_docx"], step["result_docx"]],
                    is_fcv=bool(step.get("is_final")),
                    aligns=calc_aligns,
                )
            insert_p(space_after=5)

    # -------------------------------------------------------------------------
    # E. Final Commercial Summary Table
    # -------------------------------------------------------------------------
    insert_p(
        "Final Commercial Summary",
        bold=True, space_before=6, space_after=3, font_size=12.5, color_rgb=RGBColor(234, 88, 12),
    )
    insert_p(
        f"Consolidated Contract Summary in Proposal Reporting Currency ({rep_curr}). Exclusive of applicable statutory taxes.",
        space_after=5, font_size=9.0, color_rgb=RGBColor(71, 85, 105),
    )

    sum_aligns = [WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT]
    sum_tbl = insert_table(cols=4, col_widths=[3.1, 1.3, 1.4, 1.6])
    _add_styled_row(sum_tbl, ["Summary Component", "Charge Nature", "First Year", f"Contract Total ({term_m} Mo)"], is_header=True, aligns=sum_aligns)

    term_y_safe = max(term_y, 1.0)
    if data["has_license_amc"]:
        _add_styled_row(sum_tbl, ["Total License Charges", "One-Time", format_money(data["total_license_reporting"], rep_curr), format_money(data["total_license_reporting"], rep_curr)], aligns=sum_aligns)
        _add_styled_row(sum_tbl, ["Total AMC Charges", "Recurring Annual", format_money(data["total_amc_reporting"] / term_y_safe, rep_curr), format_money(data["total_amc_reporting"], rep_curr)], aligns=sum_aligns)
    if data["has_platform_subscription"]:
        _add_styled_row(sum_tbl, ["Total Platform Charges", "Annual / Term", format_money(data["total_platform_reporting"] / term_y_safe, rep_curr), format_money(data["total_platform_reporting"], rep_curr)], aligns=sum_aligns)
        _add_styled_row(sum_tbl, ["Total Subscription Charges", "Recurring Monthly", format_money(data["total_sub_recurring_reporting"] / term_y_safe, rep_curr), format_money(data["total_sub_recurring_reporting"], rep_curr)], aligns=sum_aligns)
    if data["has_pepm"]:
        _add_styled_row(sum_tbl, ["Total PEPM Subscription Charges", "Recurring Monthly", format_money(data["total_pepm_reporting"] / term_y_safe, rep_curr), format_money(data["total_pepm_reporting"], rep_curr)], aligns=sum_aligns)
    if data["all_service_lines"]:
        srv_summary_amt = data["total_services_gross_reporting"] if data["total_discounts_reporting"] > 0 else data["total_services"]
        _add_styled_row(sum_tbl, ["Total Professional Services Charges", "One-Time Delivery", format_money(srv_summary_amt, rep_curr), format_money(srv_summary_amt, rep_curr)], aligns=sum_aligns)
    if data["total_discounts_reporting"] > 0:
        _add_styled_row(sum_tbl, ["Less: Applicable Commercial Discounts", "Authorized Discount", "Shown Separately", f"−{format_money(data['total_discounts_reporting'], rep_curr)}"], aligns=sum_aligns)
    fx_adj = data.get("fx_rounding_adjustment") or 0.0
    if abs(fx_adj) >= 0.01:
        adj_str = f"−{format_money(abs(fx_adj), rep_curr)}" if fx_adj < 0 else f"+{format_money(fx_adj, rep_curr)}"
        _add_styled_row(sum_tbl, ["FX Conversion Rounding Adjustment*", "Component FX Rounding", "—", adj_str], aligns=sum_aligns)

    _add_styled_row(
        sum_tbl,
        [f"FINAL CALCULATED CONTRACT VALUE (FCV) — {rep_curr}", f"{term_m} Months", format_money(data["annual_fcv"], rep_curr), format_money(data["fcv"], rep_curr)],
        is_fcv=True, aligns=sum_aligns,
    )

    if abs(fx_adj) >= 0.01:
        insert_p(
            "* FX Rounding Adjustment reconciles independently rounded gross/discount display lines with the authoritative Contract FCV calculated from consolidated net FX conversion.",
            space_before=3, space_after=3, font_size=8.5, color_rgb=RGBColor(71, 85, 105),
        )
    else:
        insert_p(space_after=4)

    if is_multi_country:
        insert_p("Consolidated Currency Conversion Note:", bold=True, space_before=3, space_after=2, font_size=9.5, color_rgb=RGBColor(11, 21, 40))
        for cg in data["countries_grouped"]:
            n_curr = cg["native_currency"]
            fx_note = f" → {format_money(cg['contract_reporting_total'], rep_curr)} {rep_curr} (@ FX {cg['fx_multiplier']:.4f})" if n_curr != rep_curr else ""
            insert_p(
                f"• {cg['country_name']}: {format_money(cg['contract_native_total'], n_curr)} {n_curr}{fx_note}",
                space_before=1, space_after=1, font_size=9.0, color_rgb=RGBColor(71, 85, 105),
            )
        insert_p(space_after=4)

    insert_p(
        "Note: All commercials indicated above are strictly exclusive of Government Taxes / VAT / GST.",
        bold=True, space_before=4, space_after=10, font_size=9.5, color_rgb=RGBColor(180, 83, 9),
    )

    # Populate Proposal Content narrative, structured tables, and attachments
    _populate_proposal_content_sections(doc=doc, data=data, proposal_id=proposal_id, db=db)

    output_stream = io.BytesIO()
    doc.save(output_stream)
    output_stream.seek(0)
    return output_stream


# ---------------------------------------------------------------------------
# PDF Document (.pdf) Generation
# ---------------------------------------------------------------------------

def _wrap_pdf_lines(fitz_mod, text: str, max_width: float, fontsize: float = 8.0) -> List[str]:
    """Wrap text into lines that fit within max_width using PyMuPDF Helvetica metrics."""
    raw = str(text or "")
    words = raw.split()
    if not words:
        return [""]
    lines: List[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if fitz_mod.get_text_length(candidate, fontname="helv", fontsize=fontsize) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def generate_proposal_pdf(
    proposal_id: int,
    db: Session,
    _preloaded_data: Optional[Dict[str, Any]] = None,
) -> io.BytesIO:
    """Generate a high-resolution multi-page PDF report matching the exact snapshot commercial figures."""
    import pymupdf as fitz  # PyMuPDF

    data = _preloaded_data or extract_proposal_export_data(proposal_id=proposal_id, db=db)

    pdf_doc = fitz.open()
    page_w = 595.276
    page_h = 841.890
    left = 40.0
    top = 36.0
    width = 515.0
    bottom_limit = 788.0

    page = pdf_doc.new_page(width=page_w, height=page_h)  # A4

    # Page 1 Header Bar
    header_rect = fitz.Rect(left, top, left + width, top + 60.0)
    page.draw_rect(header_rect, color=(0.043, 0.082, 0.157), fill=(0.043, 0.082, 0.157))
    page.insert_text(fitz.Point(left + 15, top + 25), "ADRENALIN COMMERCIAL PROPOSAL", fontsize=15, color=(1, 1, 1))
    page.insert_text(
        fitz.Point(left + 15, top + 45),
        f"Proposal Ref: {data['proposal_code']}  |  Snapshot #{data['snapshot_id']}  |  Date: {data['proposal_date']}",
        fontsize=9.0, color=(0.918, 0.345, 0.047),
    )

    y = top + 76.0

    # Overview Box
    overview_rect = fitz.Rect(left, y, left + width, y + 76.0)
    page.draw_rect(overview_rect, color=(0.796, 0.835, 0.882), fill=(0.973, 0.980, 0.988))
    page.insert_text(fitz.Point(left + 12, y + 19), f"Customer: {data['customer_name']}", fontsize=10, color=(0.043, 0.082, 0.157))
    page.insert_text(fitz.Point(left + 290, y + 19), f"Currency: {data['reporting_currency']}", fontsize=10, color=(0.043, 0.082, 0.157))
    page.insert_text(fitz.Point(left + 12, y + 39), f"Countries: {', '.join(data['countries'])}", fontsize=9, color=(0.278, 0.333, 0.416))
    page.insert_text(fitz.Point(left + 290, y + 39), f"Duration: {data['contract_duration_display']}", fontsize=9, color=(0.278, 0.333, 0.416))
    page.insert_text(fitz.Point(left + 12, y + 59), f"Tier: {data['customer_tier']}  |  Headcount: {data['total_headcount']:,}", fontsize=9, color=(0.278, 0.333, 0.416))
    page.insert_text(fitz.Point(left + 290, y + 59), f"Deployment: {', '.join(data['deployments'])}", fontsize=9, color=(0.278, 0.333, 0.416))

    y += 94.0

    def start_new_page():
        nonlocal page, y
        page = pdf_doc.new_page(width=page_w, height=page_h)
        cont_rect = fitz.Rect(left, top, left + width, top + 24.0)
        page.draw_rect(cont_rect, color=(0.043, 0.082, 0.157), fill=(0.043, 0.082, 0.157))
        page.insert_text(
            fitz.Point(left + 10, top + 16),
            f"ADRENALIN COMMERCIAL PROPOSAL (CONTINUED)  |  Ref: {data['proposal_code']}  |  Snapshot #{data['snapshot_id']}",
            fontsize=8.5, color=(1, 1, 1),
        )
        y = top + 38.0

    def ensure_space(needed_h: float) -> bool:
        if y + needed_h > bottom_limit:
            start_new_page()
            return True
        return False

    def insert_right(right_x: float, baseline_y: float, text: str, fontsize: float, color: tuple):
        txt = str(text)
        txt_w = fitz.get_text_length(txt, fontname="helv", fontsize=fontsize)
        page.insert_text(fitz.Point(right_x - txt_w, baseline_y), txt, fontsize=fontsize, color=color)

    rep_curr = data["reporting_currency"]
    term_y = max(data["contract_term_years"], 1.0)

    # -------------------------------------------------------------------------
    # Commercial Calculation Details (Appears BEFORE Final Commercial Summary)
    # -------------------------------------------------------------------------
    calc_details = data.get("calculation_details") or []
    if calc_details:
        ensure_space(80.0)
        page.insert_text(fitz.Point(left, y), "COMMERCIAL CALCULATION DETAILS", fontsize=11.5, color=(0.918, 0.345, 0.047))
        y += 13.0
        page.insert_text(
            fitz.Point(left, y),
            "Formula-by-formula commercial calculation breakdown from approved snapshot values.",
            fontsize=8.0, color=(0.278, 0.333, 0.416),
        )
        y += 12.0

        c_step_x = left + 6.0
        c_form_x = left + 150.0
        c_amt_rx = left + width - 8.0
        step_max_w = 136.0
        form_max_w = 248.0

        def draw_calc_table_header():
            nonlocal y
            hdr_rect = fitz.Rect(left, y, left + width, y + 20.0)
            page.draw_rect(hdr_rect, color=(0.043, 0.082, 0.157), fill=(0.043, 0.082, 0.157))
            page.insert_text(fitz.Point(c_step_x, y + 13.5), "Calculation Step", fontsize=8.5, color=(1, 1, 1))
            page.insert_text(fitz.Point(c_form_x, y + 13.5), "Formula & Snapshot Inputs", fontsize=8.5, color=(1, 1, 1))
            insert_right(c_amt_rx, y + 13.5, "Calculated Amount", fontsize=8.5, color=(1, 1, 1))
            y += 20.0

        for detail in calc_details:
            n_curr = detail["native_currency"]
            c_label = (
                f"{detail['country_name']} ({n_curr})"
                if detail.get("country_name") and detail["country_name"] != "All Regions"
                else f"Region ({n_curr})"
            )
            fx_note = (
                f" | FX ({n_curr}->{rep_curr}): {detail['fx_rate_display']}"
                if detail.get("fx_applied")
                else f" | Reporting: {rep_curr}"
            )
            meta_line = (
                f"Model: {detail['pricing_model']} | {c_label} | Duration: {detail['contract_duration_display']}{fx_note}"
            )

            ensure_space(72.0)
            banner_rect = fitz.Rect(left, y, left + width, y + 28.0)
            page.draw_rect(banner_rect, color=(0.796, 0.835, 0.882), fill=(0.945, 0.961, 0.976))
            page.insert_text(
                fitz.Point(left + 6, y + 12),
                f"{detail['product_name']} - {detail['pricing_model']} ({c_label})",
                fontsize=9.0, color=(0.043, 0.082, 0.157),
            )
            page.insert_text(fitz.Point(left + 6, y + 23), meta_line, fontsize=7.5, color=(0.278, 0.333, 0.416))
            y += 28.0

            draw_calc_table_header()

            for s_idx, step in enumerate(detail["steps"]):
                lbl_lines = _wrap_pdf_lines(fitz, step["label"], step_max_w, fontsize=8.0)
                form_lines = _wrap_pdf_lines(fitz, step["formula_pdf"], form_max_w, fontsize=8.0)
                line_count = max(len(lbl_lines), len(form_lines))
                row_h = max(18.0, 8.0 + line_count * 10.5)

                if ensure_space(row_h):
                    page.insert_text(
                        fitz.Point(left, y - 2),
                        f"{detail['product_name']} ({c_label}) - continued",
                        fontsize=8.5, color=(0.043, 0.082, 0.157),
                    )
                    y += 4.0
                    draw_calc_table_header()

                is_final = bool(step.get("is_final"))
                row_fill = (1.0, 0.969, 0.929) if is_final else ((0.973, 0.980, 0.988) if s_idx % 2 == 1 else (1, 1, 1))
                row_border = (0.918, 0.345, 0.047) if is_final else (0.796, 0.835, 0.882)
                row_rect = fitz.Rect(left, y, left + width, y + row_h)
                page.draw_rect(row_rect, color=row_border, fill=row_fill)

                lbl_color = (0.043, 0.082, 0.157) if is_final else (0.059, 0.090, 0.165)
                amt_color = (0.761, 0.255, 0.047) if is_final else (0.059, 0.090, 0.165)

                for li, l_txt in enumerate(lbl_lines):
                    page.insert_text(fitz.Point(c_step_x, y + 12.0 + li * 10.5), l_txt, fontsize=8.0, color=lbl_color)
                for fi, f_txt in enumerate(form_lines):
                    page.insert_text(fitz.Point(c_form_x, y + 12.0 + fi * 10.5), f_txt, fontsize=7.8, color=(0.278, 0.333, 0.416))
                insert_right(c_amt_rx, y + 12.0, step["result_pdf"], fontsize=8.2 if is_final else 8.0, color=amt_color)
                y += row_h

            y += 12.0

    # -------------------------------------------------------------------------
    # Final Commercial Summary Table
    # -------------------------------------------------------------------------
    x_comp = left + 8.0
    x_basis = left + 205.0
    r_yr1 = left + 392.0
    r_fcv = left + width - 10.0

    rows_data = []
    if data["has_license_amc"]:
        rows_data.append(("Total License Charges", "One-Time", format_money_pdf(data["total_license_reporting"], rep_curr), format_money_pdf(data["total_license_reporting"], rep_curr)))
        rows_data.append(("Total AMC Charges", "Annual", format_money_pdf(data["total_amc_reporting"] / term_y, rep_curr), format_money_pdf(data["total_amc_reporting"], rep_curr)))
    if data["has_platform_subscription"]:
        rows_data.append(("Total Platform Charges", "Annual / Term", format_money_pdf(data["total_platform_reporting"] / term_y, rep_curr), format_money_pdf(data["total_platform_reporting"], rep_curr)))
        rows_data.append(("Total Subscription Charges", "Monthly", format_money_pdf(data["total_sub_recurring_reporting"] / term_y, rep_curr), format_money_pdf(data["total_sub_recurring_reporting"], rep_curr)))
    if data["has_pepm"]:
        rows_data.append(("Total PEPM Charges", "Monthly Usage", format_money_pdf(data["total_pepm_reporting"] / term_y, rep_curr), format_money_pdf(data["total_pepm_reporting"], rep_curr)))
    if data["all_service_lines"]:
        srv_summary_amt = data["total_services_gross_reporting"] if data["total_discounts_reporting"] > 0 else data["total_services"]
        rows_data.append(("Total Professional Services", "One-Time", format_money_pdf(srv_summary_amt, rep_curr), format_money_pdf(srv_summary_amt, rep_curr)))
    if data["total_discounts_reporting"] > 0:
        rows_data.append(("Less: Applicable Discounts", "Authorized", "See Schedule", f"-{format_money_pdf(data['total_discounts_reporting'], rep_curr)}"))
    fx_adj = data.get("fx_rounding_adjustment") or 0.0
    if abs(fx_adj) >= 0.01:
        rows_data.append(("FX Rounding Adjustment*", "FX Rounding", "-", format_money_pdf(fx_adj, rep_curr)))

    def draw_summary_header():
        nonlocal y
        tbl_header = fitz.Rect(left, y, left + width, y + 22.0)
        page.draw_rect(tbl_header, color=(0.043, 0.082, 0.157), fill=(0.043, 0.082, 0.157))
        page.insert_text(fitz.Point(x_comp, y + 15), "Commercial Component", fontsize=9, color=(1, 1, 1))
        page.insert_text(fitz.Point(x_basis, y + 15), "Billing Basis", fontsize=9, color=(1, 1, 1))
        insert_right(r_yr1, y + 15, "First Year", fontsize=9, color=(1, 1, 1))
        insert_right(r_fcv, y + 15, "Contract Total (FCV)", fontsize=9, color=(1, 1, 1))
        y += 22.0

    ensure_space(64.0)
    page.insert_text(fitz.Point(left, y), "FINAL COMMERCIAL SUMMARY", fontsize=11.5, color=(0.918, 0.345, 0.047))
    y += 12.0
    draw_summary_header()

    for idx, (comp, basis, yr1, fcv) in enumerate(rows_data):
        if ensure_space(20.0):
            draw_summary_header()
        fill_color = (0.945, 0.961, 0.976) if idx % 2 == 1 else (1, 1, 1)
        row_rect = fitz.Rect(left, y, left + width, y + 20.0)
        page.draw_rect(row_rect, color=(0.796, 0.835, 0.882), fill=fill_color)
        page.insert_text(fitz.Point(x_comp, y + 14), comp[:40], fontsize=8.5, color=(0.059, 0.090, 0.165))
        page.insert_text(fitz.Point(x_basis, y + 14), basis, fontsize=8.5, color=(0.278, 0.333, 0.416))
        insert_right(r_yr1, y + 14, yr1, fontsize=8.5, color=(0.059, 0.090, 0.165))
        insert_right(r_fcv, y + 14, fcv, fontsize=8.5, color=(0.059, 0.090, 0.165))
        y += 20.0

    # FCV Row
    if ensure_space(28.0):
        draw_summary_header()
    total_rect = fitz.Rect(left, y, left + width, y + 26.0)
    page.draw_rect(total_rect, color=(0.918, 0.345, 0.047), fill=(1.0, 0.969, 0.929))
    page.insert_text(fitz.Point(x_comp, y + 17), f"FINAL CONTRACT VALUE (FCV) - {rep_curr}", fontsize=9.5, color=(0.043, 0.082, 0.157))
    page.insert_text(fitz.Point(x_basis, y + 17), f"{data['contract_term_months']} Months", fontsize=9, color=(0.278, 0.333, 0.416))
    insert_right(r_yr1, y + 17, format_money_pdf(data["annual_fcv"], rep_curr), fontsize=9.5, color=(0.043, 0.082, 0.157))
    insert_right(r_fcv, y + 17, format_money_pdf(data["fcv"], rep_curr), fontsize=10, color=(0.761, 0.255, 0.047))
    y += 26.0

    if abs(fx_adj) >= 0.01:
        ensure_space(34.0)
        y += 14.0
        page.insert_text(
            fitz.Point(left, y),
            "* FX Rounding Adjustment reconciles independently rounded display lines with authoritative Contract FCV.",
            fontsize=7.5, color=(0.278, 0.333, 0.416),
        )
        y += 20.0
    else:
        y += 22.0

    # Multi-Country Breakdown
    if len(data["countries_grouped"]) > 1:
        ensure_space(28.0)
        page.insert_text(fitz.Point(left, y), "MULTI-COUNTRY REGIONAL BREAKDOWN", fontsize=10, color=(0.043, 0.082, 0.157))
        y += 14.0
        for cg in data["countries_grouped"]:
            ensure_space(15.0)
            n_curr = cg["native_currency"]
            fx_str = f"  |  Converted: {format_money_pdf(cg['contract_reporting_total'], rep_curr)} (@ FX {cg['fx_multiplier']:.4f})" if n_curr != rep_curr else ""
            page.insert_text(
                fitz.Point(left + 10, y),
                f"- {cg['country_name']} ({n_curr}): {format_money_pdf(cg['contract_native_total'], n_curr)}{fx_str}",
                fontsize=8.5, color=(0.278, 0.333, 0.416),
            )
            y += 13.0
        y += 8.0

    # Line items breakdown summary on PDF
    if data["all_line_items"] or data["all_service_lines"]:
        ensure_space(28.0)
        page.insert_text(fitz.Point(left, y), "ITEMIZED COMMERCIAL SCHEDULE", fontsize=10.5, color=(0.043, 0.082, 0.157))
        y += 14.0
        for p in data["products_commercials"]:
            n_curr = p["native_currency"]
            for item in p["line_items"]:
                desc = f"- {item.get('target_name')} ({p['country_name']}): Qty {float(item.get('average_monthly_volume') or 0):,.0f} | Contract Gross: {format_money_pdf(item.get('contract_subscription_before_discount') or item.get('contract_subscription_after_discount'), n_curr)}"
                for d_line in _wrap_pdf_lines(fitz, desc, width - 16.0, fontsize=8.5):
                    ensure_space(13.0)
                    page.insert_text(fitz.Point(left + 10, y), d_line, fontsize=8.5, color=(0.059, 0.090, 0.165))
                    y += 13.0
        for srv in data["all_service_lines"]:
            curr = srv.get("currency_code") or rep_curr
            desc = f"- Service - {srv.get('role_name')}: {float(srv.get('man_days') or 0):g} Days @ {format_money_pdf(srv.get('day_rate'), curr)}/day = {format_money_pdf(srv.get('service_line_total'), curr)}"
            for d_line in _wrap_pdf_lines(fitz, desc, width - 16.0, fontsize=8.5):
                ensure_space(13.0)
                page.insert_text(fitz.Point(left + 10, y), d_line, fontsize=8.5, color=(0.059, 0.090, 0.165))
                y += 13.0
        y += 10.0

    # Contractual Footer Sections Notice
    ensure_space(54.0)
    page.insert_text(fitz.Point(left, y), "T&C for above Commercials, Payment Terms & Terms of Proposal", fontsize=9.5, color=(0.043, 0.082, 0.157))
    y += 13.0
    notes = [
        "1. The above commercials are strictly exclusive of Government Taxes / VAT / GST.",
        f"2. Commercials assume a committed minimum subscription lock-in matching the {data['contract_term_months']}-month duration.",
        "3. Standard Payment Terms, Change Request Rates, and Terms of Proposal apply as detailed in the full Word Proposal.",
    ]
    for n in notes:
        ensure_space(13.0)
        page.insert_text(fitz.Point(left + 8, y), n, fontsize=8, color=(0.278, 0.333, 0.416))
        y += 12.0

    total_pages = len(pdf_doc)
    for page_idx in range(total_pages):
        p_obj = pdf_doc[page_idx]
        p_obj.insert_text(
            fitz.Point(left, 814.0),
            f"Adrenalin Deal Desk Commercial Calculator  |  Authoritative Snapshot #{data['snapshot_id']}  |  Page {page_idx + 1} of {total_pages}",
            fontsize=7.5, color=(0.584, 0.639, 0.722),
        )

    output_stream = io.BytesIO()
    pdf_doc.save(output_stream)
    pdf_doc.close()
    output_stream.seek(0)
    return output_stream
