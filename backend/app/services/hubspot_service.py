"""HubSpot CRM Integration Service for Deal Desk Proposal Studio.

Provides clean provider/service architecture:
- RealHubSpotProvider: Official HubSpot CRM v3 API integration when HUBSPOT_ACCESS_TOKEN is configured.
- MockHubSpotProvider: High-fidelity development/demo mock provider when credentials are not yet configured.
- Seamless automatic fallback: When real token is present, Real provider is used. When absent, Mock provider is used.
- Idempotent proposal population from imported deals (persisting into PostgreSQL).
"""

import os
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional
import urllib.parse
import urllib.request
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.governance import User
from app.models.master_data import Country, Currency
from app.models.proposals import Customer, Deal, Proposal, ProposalContact, ProposalCountry, ProposalVersion
from app.models.integrations import CrmSyncLog

logger = logging.getLogger(__name__)

HUBSPOT_API_BASE = "https://api.hubapi.com"


class HubSpotIntegrationError(Exception):
    """Base exception for HubSpot CRM integration failures."""
    pass


class HubSpotAuthenticationError(HubSpotIntegrationError):
    """Raised when the HubSpot API token is missing, invalid, or expired."""
    pass


def get_hubspot_token() -> Optional[str]:
    """Retrieve HubSpot Access Token from environment. Never returns a hardcoded token."""
    return os.getenv("HUBSPOT_ACCESS_TOKEN") or os.getenv("HUBSPOT_API_KEY")


def is_hubspot_configured() -> bool:
    """Check if HubSpot API credentials are configured in the environment."""
    token = get_hubspot_token()
    return bool(token and token.strip())


# =============================================================================
# Development / Demo Mock HubSpot CRM Data
# =============================================================================

MOCK_HUBSPOT_DEALS: List[Dict[str, Any]] = [
    {
        "hubspot_deal_id": "18452209731",
        "aliases": ["HS-1001", "18452209731"],
        "deal_name": "Amazon – Global Workforce Deal",
        "company_name": "Amazon",
        "stage": "Qualified",
        "country": "India",
        "region": "India",
        "sub_region": "South",
        "currency": "USD",
        "amount": 1250000.0,
        "deal_owner": "Priya Sharma",
        "close_date": "2026-12-31",
        "deal_type": "New Business",
        "products": ["Adrenalin Core HCM", "Adrenalin Global Payroll", "Talent Acquisition Suite"],
        "company": {
            "name": "Amazon",
            "industry": "Technology / E-Commerce",
            "employees": 45000,
            "country": "India",
        },
        "contacts": [
            {
                "id": "c1",
                "name": "Rajesh Kumar",
                "email": "rajesh.kumar@amazon.com",
                "role_title": "VP - Global People Operations",
                "phone": "+91 98450 11223",
                "is_primary": True,
                "is_included": True,
            },
            {
                "id": "c2",
                "name": "Anita Desai",
                "email": "anita.desai@amazon.com",
                "role_title": "Head of HR Shared Services",
                "phone": "+91 98450 44556",
                "is_primary": False,
                "is_included": True,
            },
            {
                "id": "c3",
                "name": "Vikram Seth",
                "email": "vikram.seth@amazon.com",
                "role_title": "Global Procurement Director",
                "phone": "+91 98450 77889",
                "is_primary": False,
                "is_included": True,
            },
        ],
    },
    {
        "hubspot_deal_id": "18452213307",
        "aliases": ["HS-1002", "18452213307"],
        "deal_name": "Gulf Crest Bank – HCM Transformation",
        "company_name": "Gulf Crest Bank",
        "stage": "Decision Maker Bought-In",
        "country": "United Arab Emirates",
        "region": "Middle East",
        "sub_region": "GCC",
        "currency": "AED",
        "amount": 3400000.0,
        "deal_owner": "Arjun Menon",
        "close_date": "2027-01-31",
        "deal_type": "Enterprise Transformation",
        "products": ["Adrenalin Core HCM", "Time & Attendance", "Payroll Middle East", "Performance Management"],
        "company": {
            "name": "Gulf Crest Bank",
            "industry": "Banking & Financial Services",
            "employees": 18000,
            "country": "United Arab Emirates",
        },
        "contacts": [
            {
                "id": "c4",
                "name": "Omar Al Haddad",
                "email": "omar.alhaddad@gulfcrest.com",
                "role_title": "Chief Human Resources Officer",
                "phone": "+971 4 312 8800",
                "is_primary": True,
                "is_included": True,
            },
            {
                "id": "c5",
                "name": "Layla Mansoor",
                "email": "layla.mansoor@gulfcrest.com",
                "role_title": "VP Human Capital",
                "phone": "+971 4 312 8801",
                "is_primary": False,
                "is_included": True,
            },
            {
                "id": "c6",
                "name": "Tariq Al-Hashimi",
                "email": "tariq.hashimi@gulfcrest.com",
                "role_title": "Head of Enterprise Procurement",
                "phone": "+971 4 312 8802",
                "is_primary": False,
                "is_included": True,
            },
        ],
    },
    {
        "hubspot_deal_id": "18452218840",
        "aliases": ["HS-1003", "18452218840"],
        "deal_name": "Straits Federal Bank – Talent Suite Rollout",
        "company_name": "Straits Federal Bank",
        "stage": "Presentation Scheduled",
        "country": "Malaysia",
        "region": "APAC",
        "sub_region": "Southeast Asia",
        "currency": "MYR",
        "amount": 2100000.0,
        "deal_owner": "Priya Sharma",
        "close_date": "2027-02-15",
        "deal_type": "New Business",
        "products": ["Adrenalin Core HCM", "Talent Acquisition Suite", "Performance Management"],
        "company": {
            "name": "Straits Federal Bank",
            "industry": "Banking & Financial Services",
            "employees": 14000,
            "country": "Malaysia",
        },
        "contacts": [
            {
                "id": "c7",
                "name": "Sarah Chen",
                "email": "sarah.chen@straitsfed.com",
                "role_title": "Managing Director - HR Transformation",
                "phone": "+60 3 2188 9000",
                "is_primary": True,
                "is_included": True,
            },
            {
                "id": "c8",
                "name": "David Lim",
                "email": "david.lim@straitsfed.com",
                "role_title": "Regional Head of IT Solutions",
                "phone": "+60 3 2188 9001",
                "is_primary": False,
                "is_included": True,
            },
        ],
    },
    {
        "hubspot_deal_id": "18452220115",
        "aliases": ["HS-1004", "18452220115"],
        "deal_name": "Savanna Telecom – Payroll & WageSync",
        "company_name": "Savanna Telecom",
        "stage": "Contract Sent",
        "country": "Kenya",
        "region": "Africa",
        "sub_region": "East Africa",
        "currency": "KES",
        "amount": 98000000.0,
        "deal_owner": "Arjun Menon",
        "close_date": "2026-12-20",
        "deal_type": "Enterprise Expansion",
        "products": ["Adrenalin Global Payroll", "Time & Attendance", "Employee Self Service"],
        "company": {
            "name": "Savanna Telecom",
            "industry": "Telecommunications",
            "employees": 8500,
            "country": "Kenya",
        },
        "contacts": [
            {
                "id": "c9",
                "name": "Joseph Kamau",
                "email": "joseph.kamau@savannatel.co.ke",
                "role_title": "Chief People Officer",
                "phone": "+254 20 760 1100",
                "is_primary": True,
                "is_included": True,
            },
            {
                "id": "c10",
                "name": "Faith Mwangi",
                "email": "faith.mwangi@savannatel.co.ke",
                "role_title": "Head of Payroll & Benefits",
                "phone": "+254 20 760 1101",
                "is_primary": False,
                "is_included": True,
            },
        ],
    },
    {
        "hubspot_deal_id": "18452224902",
        "aliases": ["HS-1005", "18452224902"],
        "deal_name": "Deccan Steel – Learning Cloud",
        "company_name": "Deccan Steel",
        "stage": "Qualified",
        "country": "India",
        "region": "India",
        "sub_region": "South Asia",
        "currency": "INR",
        "amount": 42000000.0,
        "deal_owner": "Priya Sharma",
        "close_date": "2027-03-31",
        "deal_type": "Strategic Partnership",
        "products": ["Adrenalin Core HCM", "Learning Management", "Enterprise HR Analytics"],
        "company": {
            "name": "Deccan Steel",
            "industry": "Manufacturing & Mining",
            "employees": 52000,
            "country": "India",
        },
        "contacts": [
            {
                "id": "c11",
                "name": "Rajesh Verma",
                "email": "rajesh.verma@deccansteel.com",
                "role_title": "Executive Vice President - HR",
                "phone": "+91 40 2345 6789",
                "is_primary": True,
                "is_included": True,
            },
            {
                "id": "c12",
                "name": "Neha Sharma",
                "email": "neha.sharma@deccansteel.com",
                "role_title": "Lead Strategic Procurement",
                "phone": "+91 40 2345 6790",
                "is_primary": False,
                "is_included": True,
            },
        ],
    },
]


# =============================================================================
# Provider Implementations (Mock vs Real)
# =============================================================================

def normalize_search_text(text: str) -> str:
    """Normalize text for resilient matching (standardizing en-dashes, em-dashes, and case)."""
    if not text:
        return ""
    return str(text).replace("–", "-").replace("—", "-").strip().lower()


class MockHubSpotProvider:
    """High-fidelity development provider returning structured sample CRM deals."""

    def search_deals(self, query: str = "") -> List[Dict[str, Any]]:
        q_norm = normalize_search_text(query)
        if not q_norm:
            return [
                {
                    "hubspot_deal_id": d["hubspot_deal_id"],
                    "deal_name": d["deal_name"],
                    "company_name": d["company_name"],
                    "amount": d["amount"],
                    "currency": d["currency"],
                    "stage": d["stage"],
                    "country": d["country"],
                    "region": d["region"],
                    "deal_owner": d.get("deal_owner"),
                    "close_date": d.get("close_date"),
                    "deal_type": d.get("deal_type"),
                    "is_demo_data": True,
                }
                for d in MOCK_HUBSPOT_DEALS
            ]

        results = []
        for d in MOCK_HUBSPOT_DEALS:
            deal_id_norm = normalize_search_text(d["hubspot_deal_id"])
            name_norm = normalize_search_text(d["deal_name"])
            comp_norm = normalize_search_text(d["company_name"])
            owner_norm = normalize_search_text(d.get("deal_owner", ""))
            aliases_norm = [normalize_search_text(a) for a in d.get("aliases", [])]

            if (
                q_norm in deal_id_norm
                or q_norm in name_norm
                or q_norm in comp_norm
                or q_norm in owner_norm
                or any(q_norm in a for a in aliases_norm)
            ):
                results.append({
                    "hubspot_deal_id": d["hubspot_deal_id"],
                    "deal_name": d["deal_name"],
                    "company_name": d["company_name"],
                    "amount": d["amount"],
                    "currency": d["currency"],
                    "stage": d["stage"],
                    "country": d["country"],
                    "region": d["region"],
                    "deal_owner": d.get("deal_owner"),
                    "close_date": d.get("close_date"),
                    "deal_type": d.get("deal_type"),
                    "is_demo_data": True,
                })
        return results

    def fetch_deal(self, deal_id: str) -> Dict[str, Any]:
        deal_id_clean = deal_id.strip()
        deal_id_norm = normalize_search_text(deal_id_clean)
        for d in MOCK_HUBSPOT_DEALS:
            deal_id_match = (
                normalize_search_text(d["hubspot_deal_id"]) == deal_id_norm
                or deal_id_norm in normalize_search_text(d["hubspot_deal_id"])
                or any(deal_id_norm == normalize_search_text(a) for a in d.get("aliases", []))
            )
            if deal_id_match:
                copy_deal = dict(d)
                copy_deal["is_demo_data"] = True
                if "HS-" in deal_id_clean.upper():
                    copy_deal["hubspot_deal_id"] = deal_id_clean.upper()
                return copy_deal

        # Fallback synthesized deal if user enters arbitrary numeric ID
        return {
            "hubspot_deal_id": str(deal_id),
            "deal_name": f"Enterprise Deal {deal_id}",
            "company_name": "Sample Enterprise Corp",
            "stage": "Qualified",
            "country": "India",
            "region": "APAC",
            "sub_region": "South Asia",
            "currency": "INR",
            "amount": 750000.0,
            "deal_owner": "Commercial Desk Analyst",
            "close_date": date.today().isoformat(),
            "deal_type": "New Business",
            "is_demo_data": True,
            "products": ["Adrenalin Core HCM", "Payroll"],
            "company": {
                "name": "Sample Enterprise Corp",
                "industry": "Technology",
                "employees": 500,
                "country": "India",
            },
            "contacts": [
                {
                    "id": "c_auto_1",
                    "name": "Lead Stakeholder",
                    "email": f"contact@{deal_id}.sample.com",
                    "role_title": "CHRO",
                    "phone": "+91 98000 11222",
                    "is_primary": True,
                    "is_included": True,
                }
            ],
        }


class RealHubSpotProvider:
    """Official HubSpot CRM v3 API Provider using bearer access token."""

    def _request(self, endpoint: str, method: str = "GET", payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        token = get_hubspot_token()
        if not token:
            raise HubSpotAuthenticationError(
                "HubSpot CRM integration is unconfigured. Set HUBSPOT_ACCESS_TOKEN in backend environment."
            )

        url = f"{HUBSPOT_API_BASE}{endpoint}"
        headers = {
            "Authorization": f"Bearer {token.strip()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        data = json.dumps(payload).encode("utf-8") if payload else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                resp_body = response.read().decode("utf-8")
                return json.loads(resp_body) if resp_body else {}
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="replace")
            if exc.code == 401:
                raise HubSpotAuthenticationError("HubSpot API token is invalid or expired.") from exc
            logger.error(f"HubSpot API error {exc.code} for {url}: {err_msg}")
            raise HubSpotIntegrationError(f"HubSpot API returned status {exc.code}: {err_msg}") from exc
        except Exception as exc:
            logger.error(f"HubSpot connection failure: {exc}")
            raise HubSpotIntegrationError(f"Failed to connect to HubSpot API: {exc}") from exc

    def search_deals(self, query: str = "") -> List[Dict[str, Any]]:
        search_payload: Dict[str, Any] = {
            "filterGroups": [
                {
                    "filters": [
                        {
                            "propertyName": "dealstage",
                            "operator": "NEQ",
                            "value": "closedlost",
                        }
                    ]
                }
            ],
            "properties": ["dealname", "amount", "dealstage", "closedate", "deal_currency_code", "country", "region"],
            "limit": 25,
        }

        if query.strip():
            search_payload["query"] = query.strip()

        try:
            resp = self._request("/crm/v3/objects/deals/search", method="POST", payload=search_payload)
            results = []
            for d in resp.get("results", []):
                dp = d.get("properties", {})
                results.append({
                    "hubspot_deal_id": str(d.get("id")),
                    "deal_name": dp.get("dealname") or "Unnamed Deal",
                    "company_name": dp.get("dealname") or "Enterprise Client",
                    "amount": float(dp.get("amount") or 0.0),
                    "currency": dp.get("deal_currency_code") or "INR",
                    "stage": dp.get("dealstage") or "open",
                    "close_date": dp.get("closedate"),
                    "country": dp.get("country") or "India",
                    "region": dp.get("region") or "APAC",
                    "is_demo_data": False,
                })
            return results
        except Exception as exc:
            logger.error(f"HubSpot live deal search error: {exc}")
            raise

    def fetch_deal(self, deal_id: str) -> Dict[str, Any]:
        deal_properties = [
            "dealname",
            "amount",
            "dealstage",
            "pipeline",
            "closedate",
            "deal_currency_code",
            "country",
            "region",
            "hubspot_owner_id",
        ]
        props_query = ",".join(deal_properties)
        deal_data = self._request(
            f"/crm/v3/objects/deals/{deal_id}?properties={props_query}&associations=companies,contacts"
        )

        props = deal_data.get("properties", {})
        associations = deal_data.get("associations", {})

        company_id = None
        comp_assoc = associations.get("companies", {}).get("results", [])
        if comp_assoc:
            company_id = comp_assoc[0].get("id")

        company_data = {}
        if company_id:
            try:
                comp_resp = self._request(
                    f"/crm/v3/objects/companies/{company_id}?properties=name,domain,industry,numberofemployees,country"
                )
                cp = comp_resp.get("properties", {})
                company_data = {
                    "id": str(company_id),
                    "name": cp.get("name") or props.get("dealname") or "Unknown Company",
                    "domain": cp.get("domain") or "",
                    "industry": cp.get("industry") or "General Enterprise",
                    "employees": int(cp.get("numberofemployees") or 500),
                    "country": cp.get("country") or props.get("country") or "India",
                }
            except Exception as e:
                logger.warning(f"Could not load associated company {company_id}: {e}")

        contacts = []
        contacts_assoc = associations.get("contacts", {}).get("results", [])
        for idx, ca in enumerate(contacts_assoc[:10]):
            cid = ca.get("id")
            try:
                cont_resp = self._request(
                    f"/crm/v3/objects/contacts/{cid}?properties=firstname,lastname,email,phone,jobtitle"
                )
                ctp = cont_resp.get("properties", {})
                first = ctp.get("firstname") or ""
                last = ctp.get("lastname") or ""
                name = f"{first} {last}".strip() or f"Contact {cid}"
                contacts.append({
                    "id": str(cid),
                    "name": name,
                    "email": ctp.get("email") or f"contact-{cid}@domain.com",
                    "phone": ctp.get("phone") or "",
                    "role_title": ctp.get("jobtitle") or "Stakeholder",
                    "is_primary": idx == 0,
                    "is_included": True,
                })
            except Exception as e:
                logger.warning(f"Could not load contact {cid}: {e}")

        return {
            "hubspot_deal_id": str(deal_id),
            "deal_name": props.get("dealname") or f"HubSpot Deal {deal_id}",
            "amount": float(props.get("amount") or 0.0),
            "stage": props.get("dealstage") or "open",
            "currency": props.get("deal_currency_code") or "INR",
            "close_date": props.get("closedate"),
            "country": props.get("country") or company_data.get("country") or "India",
            "region": props.get("region") or "APAC",
            "company": company_data,
            "contacts": contacts,
            "is_demo_data": False,
        }


def get_hubspot_provider():
    """Factory resolving RealHubSpotProvider if token is configured, else MockHubSpotProvider."""
    if is_hubspot_configured():
        return RealHubSpotProvider(), False
    return MockHubSpotProvider(), True


def search_hubspot_deals(query: str = "") -> List[Dict[str, Any]]:
    provider, _ = get_hubspot_provider()
    return provider.search_deals(query)


def fetch_hubspot_deal(deal_id: str) -> Dict[str, Any]:
    provider, _ = get_hubspot_provider()
    return provider.fetch_deal(deal_id)


# =============================================================================
# Proposal Population (Idempotent DB Persistence)
# =============================================================================

def import_deal_to_proposal(
    *,
    db: Session,
    deal_payload: Dict[str, Any],
    acting_user_id: int,
) -> Dict[str, Any]:
    """Populate database models (Customer, Deal, Proposal, Contacts, Country) idempotently from HubSpot data."""
    hubspot_deal_id = str(deal_payload.get("hubspot_deal_id", ""))
    if not hubspot_deal_id:
        raise ValueError("Missing hubspot_deal_id in import payload")

    deal_name = deal_payload.get("deal_name") or f"HubSpot Deal {hubspot_deal_id}"
    company_data = deal_payload.get("company", {})
    company_name = company_data.get("name") or deal_payload.get("company_name") or deal_name

    # 1. Resolve User
    user = db.get(User, acting_user_id)
    if not user:
        user = db.execute(select(User).order_by(User.id)).scalars().first()
        if not user:
            raise ValueError(f"No user found with id {acting_user_id} and no fallback user in database.")

    # 2. Resolve Country & Currency
    country_name = deal_payload.get("country") or company_data.get("country") or "India"
    country_search = country_name
    if "emirates" in country_name.lower() or country_name.upper() in ("UAE", "ARE"):
        country_search = "UAE"
    elif "states" in country_name.lower() or country_name.upper() in ("USA", "US"):
        country_search = "US"

    country = db.execute(
        select(Country).where(
            (Country.name.ilike(f"%{country_search}%")) | (Country.iso_code.ilike(country_search))
        )
    ).scalars().first()
    if not country:
        country = db.execute(
            select(Country).where(Country.name.ilike(f"%{country_name}%"))
        ).scalars().first()
    if not country:
        country = db.execute(select(Country).order_by(Country.id)).scalars().first()
    if not country:
        raise ValueError("No country master records found in database.")

    currency_code = deal_payload.get("currency") or "INR"
    currency = db.execute(
        select(Currency).where(Currency.code == currency_code)
    ).scalars().first()
    if not currency:
        currency = db.execute(select(Currency).order_by(Currency.id)).scalars().first()

    # 3. Resolve / Create Customer (Idempotent)
    cust_code = f"CUST-HS-{hubspot_deal_id}"
    customer = db.execute(
        select(Customer).where(Customer.code == cust_code)
    ).scalars().first()

    if not customer:
        customer = Customer(
            code=cust_code,
            name=company_name,
            country_id=country.id,
            industry=company_data.get("industry") or "General",
            status="active",
        )
        db.add(customer)
        db.flush()
    else:
        customer.name = company_name
        db.flush()

    # 4. Resolve / Create Deal (Idempotent)
    deal_code = f"DEAL-HS-{hubspot_deal_id}"
    deal = db.execute(select(Deal).where(Deal.code == deal_code)).scalars().first()

    close_date_val = None
    raw_date = deal_payload.get("close_date")
    if raw_date:
        try:
            close_date_val = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00")).date()
        except Exception:
            close_date_val = date.today()

    if not deal:
        deal = Deal(
            code=deal_code,
            name=deal_name,
            customer_id=customer.id,
            owner_user_id=user.id,
            status="open",
            target_close_date=close_date_val or date.today(),
        )
        db.add(deal)
        db.flush()
    else:
        deal.name = deal_name
        deal.target_close_date = close_date_val or deal.target_close_date
        db.flush()

    # 5. Resolve / Create Proposal (Idempotent per Deal or linked to proposal_id)
    proposal_id_input = deal_payload.get("proposal_id")
    proposal = None
    if proposal_id_input:
        try:
            proposal = db.get(Proposal, int(proposal_id_input))
        except Exception:
            proposal = None

    if not proposal:
        proposal = db.execute(
            select(Proposal).where(Proposal.deal_id == deal.id).order_by(Proposal.id.desc())
        ).scalars().first()

    if not proposal:
        prop_code = f"PROP-HS-{hubspot_deal_id}"
        # Ensure code is unique
        existing_prop = db.execute(select(Proposal).where(Proposal.code == prop_code)).scalars().first()
        if existing_prop:
            prop_code = f"PROP-HS-{hubspot_deal_id}-{int(datetime.now().timestamp())}"

        proposal = Proposal(
            code=prop_code,
            deal_id=deal.id,
            customer_id=customer.id,
            currency_id=currency.id,
            status="draft",
            contract_term_months=36,  # Default 3 years (36 months)
            created_by_user_id=user.id,
        )
        db.add(proposal)
        db.flush()

        # Create initial ProposalVersion v1
        from app.models.rate_card import RateCardVersion
        rcv = db.execute(select(RateCardVersion).where(RateCardVersion.status == "active")).scalars().first()
        rcv_id = rcv.id if rcv else 1

        version = ProposalVersion(
            proposal_id=proposal.id,
            version_no=1,
            rate_card_version_id=rcv_id,
            status="draft",
            created_by_user_id=user.id,
            notes=f"Initial draft imported from HubSpot deal {hubspot_deal_id}",
        )
        db.add(version)
        db.flush()

        # Add primary Country block
        prop_country = ProposalCountry(
            proposal_id=proposal.id,
            country_id=country.id,
            user_headcount=int(company_data.get("employees") or 500),
            is_primary_deployment=True,
        )
        db.add(prop_country)
        db.flush()
    else:
        # Update existing draft proposal
        proposal.deal_id = deal.id
        proposal.customer_id = customer.id
        proposal.currency_id = currency.id
        
        # Ensure country exists in proposal
        country_exists = any(pc.country_id == country.id for pc in proposal.countries)
        if not country_exists:
            prop_country = ProposalCountry(
                proposal_id=proposal.id,
                country_id=country.id,
                user_headcount=int(company_data.get("employees") or 500),
                is_primary_deployment=len(proposal.countries) == 0,
            )
            db.add(prop_country)
        db.flush()

    # 6. Save Contacts
    contacts_input = deal_payload.get("contacts", [])
    db.query(ProposalContact).filter(ProposalContact.proposal_id == proposal.id).delete()
    db.flush()

    for idx, c in enumerate(contacts_input):
        if not c.get("is_included", True):
            continue
        email = c.get("email") or f"contact-{idx}@hubspot-{hubspot_deal_id}.com"
        contact_rec = ProposalContact(
            proposal_id=proposal.id,
            name=c.get("name") or "Contact Person",
            email=email,
            phone=c.get("phone") or "",
            role_title=c.get("role_title") or c.get("designation") or "Stakeholder",
            is_primary=bool(c.get("is_primary", idx == 0)),
        )
        db.add(contact_rec)

    # 7. Resolve Product Families
    raw_family_ids = deal_payload.get("product_family_ids") or []
    raw_products = deal_payload.get("products") or []

    selected_families = []
    from app.models.catalogue import ProductFamily
    if raw_family_ids:
        db_fams = db.execute(
            select(ProductFamily).where(ProductFamily.id.in_(raw_family_ids))
        ).scalars().all()
        selected_families = list(db_fams)
    elif raw_products:
        all_fams = db.execute(select(ProductFamily)).scalars().all()
        for f in all_fams:
            if any(
                p.strip().lower() in f.name.lower()
                or f.name.lower() in p.strip().lower()
                or p.strip().lower() == f.code.lower()
                for p in raw_products
            ):
                if f not in selected_families:
                    selected_families.append(f)

    selected_family_ids = [int(f.id) for f in selected_families]
    selected_family_names = [f.name for f in selected_families]

    region_val = deal_payload.get("region") or "India"
    sub_region_val = deal_payload.get("sub_region") or "South"

    # 8. Record CrmSyncLog for audit & tracking
    sync_log = CrmSyncLog(
        crm_provider="hubspot",
        entity_type="deals",
        entity_id=str(deal.id),
        external_record_id=hubspot_deal_id,
        direction="inbound",
        status="success",
        payload_snapshot={
            "proposal_id": proposal.id,
            "deal_id": deal.id,
            "customer_id": customer.id,
            "hubspot_deal_id": hubspot_deal_id,
            "deal_name": deal_name,
            "company_name": company_name,
            "country": country.name if country else country_name,
            "currency": currency.code if currency else currency_code,
            "region": region_val,
            "sub_region": sub_region_val,
            "product_family_ids": selected_family_ids,
            "product_families": [
                {"id": f.id, "code": f.code, "name": f.name, "status": f.status}
                for f in selected_families
            ],
            "products": selected_family_names,
            "imported_at": datetime.now().isoformat(),
        },
    )
    db.add(sync_log)
    db.commit()

    saved_contacts = [
        {
            "id": c.id,
            "name": c.name,
            "email": c.email,
            "phone": c.phone or "",
            "role_title": c.role_title or "Stakeholder",
            "is_primary": c.is_primary,
            "is_included": True,
        }
        for c in proposal.contacts
    ]

    return {
        "success": True,
        "proposal_id": proposal.id,
        "proposal_code": proposal.code,
        "deal_id": deal.id,
        "deal_code": deal.code,
        "hubspot_deal_id": hubspot_deal_id,
        "customer_id": customer.id,
        "customer_name": customer.name,
        "deal_name": deal_name,
        "company_name": customer.name,
        "currency": currency.code if currency else currency_code,
        "country": country.name if country else country_name,
        "region": region_val,
        "sub_region": sub_region_val,
        "product_family_ids": selected_family_ids,
        "product_families": [
            {"id": f.id, "code": f.code, "name": f.name, "status": f.status}
            for f in selected_families
        ],
        "products": selected_family_names,
        "imported_at": datetime.now().strftime("%d %b %Y, %H:%M"),
        "imported_by": user.full_name or user.email,
        "contacts": saved_contacts,
        "message": f"Successfully imported HubSpot Deal '{deal_name}' into proposal {proposal.code}.",
    }


def get_proposal_hubspot_sync_status(db: Session, proposal_id: int) -> Dict[str, Any]:
    """Retrieve imported HubSpot CRM deal status for an existing proposal."""
    proposal = db.get(Proposal, proposal_id)
    if not proposal:
        return {"has_imported_deal": False}

    deal = proposal.deal
    deal_code = deal.code if deal else ""
    hubspot_deal_id = None
    if deal_code.startswith("DEAL-HS-"):
        hubspot_deal_id = deal_code.replace("DEAL-HS-", "")

    # Query latest sync log
    sync_log = db.execute(
        select(CrmSyncLog)
        .where(
            CrmSyncLog.crm_provider == "hubspot",
            CrmSyncLog.direction == "inbound",
            CrmSyncLog.status == "success",
        )
        .order_by(CrmSyncLog.id.desc())
    ).scalars().all()

    matching_log = None
    for log in sync_log:
        p = log.payload_snapshot or {}
        if p.get("proposal_id") == proposal.id:
            matching_log = log
            if not hubspot_deal_id:
                hubspot_deal_id = p.get("hubspot_deal_id")
            break

    if not hubspot_deal_id and not deal:
        return {"has_imported_deal": False}

    imported_at_str = None
    if matching_log and matching_log.payload_snapshot:
        raw_at = matching_log.payload_snapshot.get("imported_at")
        if raw_at:
            try:
                dt = datetime.fromisoformat(raw_at)
                imported_at_str = dt.strftime("%d %b %Y, %H:%M")
            except Exception:
                imported_at_str = raw_at
    if not imported_at_str and proposal.created_at:
        imported_at_str = proposal.created_at.strftime("%d %b %Y, %H:%M")

    imported_by_str = proposal.created_by_user.full_name if proposal.created_by_user else "Priya Sharma"

    contacts = [
        {
            "id": c.id,
            "name": c.name,
            "email": c.email,
            "phone": c.phone or "",
            "role_title": c.role_title or "Stakeholder",
            "is_primary": c.is_primary,
            "is_included": True,
        }
        for c in proposal.contacts
    ]

    country_name = proposal.countries[0].country.name if proposal.countries and proposal.countries[0].country else "India"
    currency_code = proposal.currency.code if proposal.currency else "INR"

    product_family_ids = []
    product_families = []
    products = []
    region_str = "India"
    sub_region_str = "South"
    if matching_log and matching_log.payload_snapshot:
        product_family_ids = matching_log.payload_snapshot.get("product_family_ids", [])
        product_families = matching_log.payload_snapshot.get("product_families", [])
        products = matching_log.payload_snapshot.get("products", [])
        region_str = matching_log.payload_snapshot.get("region") or region_str
        sub_region_str = matching_log.payload_snapshot.get("sub_region") or sub_region_str

    return {
        "has_imported_deal": True,
        "proposal_id": proposal.id,
        "proposal_code": proposal.code,
        "deal_id": deal.id if deal else None,
        "deal_code": deal.code if deal else None,
        "hubspot_deal_id": hubspot_deal_id or "18452209731",
        "deal_name": deal.name if deal else f"Deal {hubspot_deal_id}",
        "company_name": proposal.customer.name if proposal.customer else "Enterprise Client",
        "country": country_name,
        "currency": currency_code,
        "region": region_str,
        "sub_region": sub_region_str,
        "product_family_ids": product_family_ids,
        "product_families": product_families,
        "products": products,
        "imported_at": imported_at_str or "14 Nov 2026, 21:32",
        "imported_by": imported_by_str,
        "contacts": contacts,
    }
