"""Proposal & Deal Management Models for Adrenalin Deal Desk (Wave 5).

Defines the 11 core proposal and deal execution tables:
1. customers — Customer master records with tier and country links.
2. deals — Sales opportunities linked to customer and owner user.
3. proposals — Commercial quotes created for a deal.
4. proposal_contacts — Client stakeholders/contacts associated with a proposal.
5. proposal_versions — Version history of a proposal (draft, approved, locked, etc.).
6. proposal_countries — Geographic deployment scopes for a proposal.
7. proposal_line_items — Product, pack, and feature pricing lines.
8. proposal_service_lines — Professional services and implementation lines.
9. calculation_snapshots — JSONB audit snapshots of commercial calculations.
10. proposal_content — Narrative sections and terms text for a proposal version.
11. approvals — Governance workflow requests and decisions linked to thresholds/roles.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# =============================================================================
# 1. CUSTOMERS
# =============================================================================
class Customer(Base):
    """Customer account master record."""

    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("code", name="uq_customers_code"),
        CheckConstraint(
            "status IN ('active', 'inactive', 'prospect')",
            name="ck_customers_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Unique customer business code (e.g. 'CUST-001')",
    )
    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Legal customer/organization name",
    )
    country_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("countries.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Primary operating country",
    )
    customer_tier_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("customer_tiers.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        comment="Headcount volume tier band",
    )
    industry: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Industry vertical (e.g. IT, Manufacturing, Healthcare)",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
        comment="Lifecycle status: 'active', 'inactive', 'prospect'",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    country: Mapped["Country"] = relationship("Country")
    customer_tier: Mapped[Optional["CustomerTier"]] = relationship("CustomerTier")
    deals: Mapped[list["Deal"]] = relationship("Deal", back_populates="customer")


# =============================================================================
# 2. DEALS
# =============================================================================
class Deal(Base):
    """Sales deal/opportunity record."""

    __tablename__ = "deals"
    __table_args__ = (
        UniqueConstraint("code", name="uq_deals_code"),
        CheckConstraint(
            "status IN ('open', 'won', 'lost', 'abandoned')",
            name="ck_deals_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Unique deal identifier (e.g. 'DEAL-2026-001')",
    )
    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Opportunity title",
    )
    customer_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    owner_user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Sales representative or account executive owning the deal",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="open",
        server_default=text("'open'"),
        nullable=False,
        comment="Deal stage: 'open', 'won', 'lost', 'abandoned'",
    )
    target_close_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Estimated contract signing date",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="deals")
    owner_user: Mapped["User"] = relationship("User")
    proposals: Mapped[list["Proposal"]] = relationship("Proposal", back_populates="deal")


# =============================================================================
# 3. PROPOSALS
# =============================================================================
class Proposal(Base):
    """Commercial proposal container for a deal."""

    __tablename__ = "proposals"
    __table_args__ = (
        UniqueConstraint("code", name="uq_proposals_code"),
        CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'superseded')",
            name="ck_proposals_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Unique proposal business code (e.g. 'PROP-2026-0001')",
    )
    deal_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("deals.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    currency_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("currencies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Proposal commercial presentation currency",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="draft",
        server_default=text("'draft'"),
        nullable=False,
        comment="Lifecycle status: 'draft', 'submitted', 'approved', 'rejected', 'superseded'",
    )
    created_by_user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    deal: Mapped["Deal"] = relationship("Deal", back_populates="proposals")
    customer: Mapped["Customer"] = relationship("Customer")
    currency: Mapped["Currency"] = relationship("Currency")
    created_by_user: Mapped["User"] = relationship("User")
    contacts: Mapped[list["ProposalContact"]] = relationship(
        "ProposalContact", back_populates="proposal", cascade="all, delete-orphan"
    )
    versions: Mapped[list["ProposalVersion"]] = relationship(
        "ProposalVersion", back_populates="proposal", cascade="all, delete-orphan"
    )
    countries: Mapped[list["ProposalCountry"]] = relationship(
        "ProposalCountry", back_populates="proposal", cascade="all, delete-orphan"
    )


# =============================================================================
# 4. PROPOSAL CONTACTS
# =============================================================================
class ProposalContact(Base):
    """Stakeholders and point-of-contacts attached to a proposal."""

    __tablename__ = "proposal_contacts"
    __table_args__ = (
        UniqueConstraint(
            "proposal_id", "email",
            name="uq_proposal_contacts_proposal_email",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposals.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Contact person full name",
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Contact email address",
    )
    phone: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )
    role_title: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Client title (e.g. 'HR Director', 'Procurement Officer')",
    )
    is_primary: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    proposal: Mapped["Proposal"] = relationship("Proposal", back_populates="contacts")


# =============================================================================
# 5. PROPOSAL VERSIONS
# =============================================================================
class ProposalVersion(Base):
    """Versioned commercial iteration of a proposal."""

    __tablename__ = "proposal_versions"
    __table_args__ = (
        UniqueConstraint(
            "proposal_id", "version_no",
            name="uq_proposal_versions_proposal_id_version_no",
        ),
        CheckConstraint(
            "version_no > 0",
            name="ck_proposal_versions_version_no_positive",
        ),
        CheckConstraint(
            "status IN ('draft', 'under_review', 'approved', 'rejected', 'locked', 'superseded')",
            name="ck_proposal_versions_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposals.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    version_no: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Sequential version number (1, 2, 3...)",
    )
    rate_card_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("rate_card_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Pinned rate card version used for pricing calculations",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="draft",
        server_default=text("'draft'"),
        nullable=False,
        comment="Version status: 'draft', 'under_review', 'approved', 'rejected', 'locked', 'superseded'",
    )
    created_by_user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Internal notes regarding this version revision",
    )
    locked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when version was locked against modifications",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    proposal: Mapped["Proposal"] = relationship("Proposal", back_populates="versions")
    rate_card_version: Mapped["RateCardVersion"] = relationship("RateCardVersion")
    created_by_user: Mapped["User"] = relationship("User")
    line_items: Mapped[list["ProposalLineItem"]] = relationship(
        "ProposalLineItem", back_populates="proposal_version", cascade="all, delete-orphan"
    )
    service_lines: Mapped[list["ProposalServiceLine"]] = relationship(
        "ProposalServiceLine", back_populates="proposal_version", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["CalculationSnapshot"]] = relationship(
        "CalculationSnapshot", back_populates="proposal_version", cascade="all, delete-orphan"
    )
    content: Mapped[list["ProposalContent"]] = relationship(
        "ProposalContent", back_populates="proposal_version", cascade="all, delete-orphan"
    )
    approvals: Mapped[list["Approval"]] = relationship(
        "Approval", back_populates="proposal_version", cascade="all, delete-orphan"
    )


# =============================================================================
# 6. PROPOSAL COUNTRIES
# =============================================================================
class ProposalCountry(Base):
    """Geographic deployment coverage for a proposal."""

    __tablename__ = "proposal_countries"
    __table_args__ = (
        UniqueConstraint(
            "proposal_id", "country_id",
            name="uq_proposal_countries_proposal_country",
        ),
        CheckConstraint(
            "user_headcount IS NULL OR user_headcount >= 0",
            name="ck_proposal_countries_headcount_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposals.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    country_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("countries.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    user_headcount: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Specific employee count deployed in this country",
    )
    is_primary_deployment: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    proposal: Mapped["Proposal"] = relationship("Proposal", back_populates="countries")
    country: Mapped["Country"] = relationship("Country")


# =============================================================================
# 7. PROPOSAL LINE ITEMS
# =============================================================================
class ProposalLineItem(Base):
    """Commercial product/pack/feature subscription pricing line items."""

    __tablename__ = "proposal_line_items"
    __table_args__ = (
        CheckConstraint(
            "(pack_version_id IS NOT NULL AND feature_id IS NULL) OR "
            "(pack_version_id IS NULL AND feature_id IS NOT NULL)",
            name="ck_proposal_line_items_target_exclusive",
        ),
        CheckConstraint(
            "quantity >= 0",
            name="ck_proposal_line_items_quantity_non_negative",
        ),
        CheckConstraint(
            "list_unit_price >= 0",
            name="ck_proposal_line_items_list_unit_price_non_negative",
        ),
        CheckConstraint(
            "net_unit_price >= 0",
            name="ck_proposal_line_items_net_unit_price_non_negative",
        ),
        CheckConstraint(
            "discount_pct IS NULL OR (discount_pct >= 0 AND discount_pct <= 100)",
            name="ck_proposal_line_items_discount_pct_range",
        ),
        CheckConstraint(
            "extended_amount >= 0",
            name="ck_proposal_line_items_extended_amount_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposal_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    line_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Ordering sequence of line items",
    )
    pack_version_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("pack_versions.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    feature_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("features.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    uom_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("units_of_measure.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        comment="Purchased volume/headcount",
    )
    list_unit_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        comment="Base catalog rate before discounts",
    )
    discount_pct: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(7, 4),
        nullable=True,
        comment="Discount percentage granted (0-100%)",
    )
    net_unit_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        comment="Final calculated unit rate after discount",
    )
    extended_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        comment="Annualized or total line extended value",
    )
    currency_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("currencies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    proposal_version: Mapped["ProposalVersion"] = relationship(
        "ProposalVersion", back_populates="line_items"
    )
    pack_version: Mapped[Optional["PackVersion"]] = relationship("PackVersion")
    feature: Mapped[Optional["Feature"]] = relationship("Feature")
    uom: Mapped["UnitOfMeasure"] = relationship("UnitOfMeasure")
    currency: Mapped["Currency"] = relationship("Currency")


# =============================================================================
# 8. PROPOSAL SERVICE LINES
# =============================================================================
class ProposalServiceLine(Base):
    """Implementation, consulting, and professional service proposal lines."""

    __tablename__ = "proposal_service_lines"
    __table_args__ = (
        CheckConstraint(
            "days_or_hours >= 0",
            name="ck_proposal_service_lines_quantity_non_negative",
        ),
        CheckConstraint(
            "rate_applied >= 0",
            name="ck_proposal_service_lines_rate_applied_non_negative",
        ),
        CheckConstraint(
            "discount_pct IS NULL OR (discount_pct >= 0 AND discount_pct <= 100)",
            name="ck_proposal_service_lines_discount_pct_range",
        ),
        CheckConstraint(
            "extended_amount >= 0",
            name="ck_proposal_service_lines_extended_amount_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposal_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    service_rate_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("service_rates.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        comment="Reference service rate sheet item from Wave 3",
    )
    role_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Professional service role description",
    )
    days_or_hours: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        comment="Billable volume in days or hours",
    )
    rate_applied: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        comment="Hourly or daily rate charged",
    )
    discount_pct: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(7, 4),
        nullable=True,
        comment="Discretionary service discount (0-100%)",
    )
    extended_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 4),
        nullable=False,
        comment="Total net line fee",
    )
    currency_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("currencies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    proposal_version: Mapped["ProposalVersion"] = relationship(
        "ProposalVersion", back_populates="service_lines"
    )
    service_rate: Mapped[Optional["ServiceRate"]] = relationship("ServiceRate")
    currency: Mapped["Currency"] = relationship("Currency")


# =============================================================================
# 9. CALCULATION SNAPSHOTS
# =============================================================================
class CalculationSnapshot(Base):
    """Reproducible calculation audit snapshot for a proposal version."""

    __tablename__ = "calculation_snapshots"
    __table_args__ = (
        Index("ix_calc_snapshots_version", "proposal_version_id"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposal_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    snapshot_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        comment="Full JSON payload of commercial calculations, totals, ARR, TCV, GM%",
    )
    calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    calculated_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    # Relationships
    proposal_version: Mapped["ProposalVersion"] = relationship(
        "ProposalVersion", back_populates="snapshots"
    )
    calculated_by_user: Mapped[Optional["User"]] = relationship("User")


# =============================================================================
# 10. PROPOSAL CONTENT
# =============================================================================
class ProposalContent(Base):
    """Proposal document narratives, terms, and custom clauses."""

    __tablename__ = "proposal_content"
    __table_args__ = (
        UniqueConstraint(
            "proposal_version_id", "section_key",
            name="uq_proposal_content_version_section",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposal_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    section_key: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Section identifier (e.g. 'executive_summary', 'payment_terms', 'sla')",
    )
    content_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Formatted narrative body or Markdown text",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    proposal_version: Mapped["ProposalVersion"] = relationship(
        "ProposalVersion", back_populates="content"
    )


# =============================================================================
# 11. APPROVALS
# =============================================================================
class Approval(Base):
    """Workflow approval request and decision record for a proposal version."""

    __tablename__ = "approvals"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'escalated', 'cancelled')",
            name="ck_approvals_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposal_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    threshold_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("approval_thresholds.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        comment="Rule trigger threshold that mandated this approval",
    )
    assigned_role_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("roles.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Required approver role",
    )
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        comment="User who made the decision",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        server_default=text("'pending'"),
        nullable=False,
        comment="Status: 'pending', 'approved', 'rejected', 'escalated', 'cancelled'",
    )
    decision_notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Approver feedback, rationale, or rejection reason",
    )
    decided_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Decision timestamp",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    proposal_version: Mapped["ProposalVersion"] = relationship(
        "ProposalVersion", back_populates="approvals"
    )
    threshold: Mapped[Optional["ApprovalThreshold"]] = relationship("ApprovalThreshold")
    assigned_role: Mapped["Role"] = relationship("Role")
    decided_by_user: Mapped[Optional["User"]] = relationship("User")
