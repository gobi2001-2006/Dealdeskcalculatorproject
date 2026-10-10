"""Rate Card Models for Adrenalin Deal Desk (Wave 3).

Defines the three Rate Card tables:
1. rate_card_versions — Lifecycle management of rate card pricing sheets.
2. rate_cards — Commercial pricing across the six dimensions with deterministic lookup.
3. service_rates — Professional service and implementation day/hour rates by role and country.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# =============================================================================
# 1. RATE CARD VERSIONS
# =============================================================================
class RateCardVersion(Base):
    """Manages versioning and lifecycle of rate card pricing sheets.

    Only 'draft' rate card versions may be edited in the business domain.
    Active or retired versions must remain immutable to preserve historical proposals.
    User references (created_by, activated_by) are stored as string identifiers
    until a dedicated users table is introduced in future schema waves.
    """

    __tablename__ = "rate_card_versions"
    __table_args__ = (
        UniqueConstraint("version_no", name="uq_rate_card_versions_version_no"),
        CheckConstraint(
            "status IN ('draft', 'active', 'retired')",
            name="ck_rate_card_versions_status",
        ),
        CheckConstraint(
            "valid_to IS NULL OR valid_to >= valid_from",
            name="ck_rate_card_versions_valid_date_order",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    version_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Unique business version identifier (e.g. 'RC-2026.1')",
    )
    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Human-readable version name (e.g. 'FY26 Q1 Global Rate Card')",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="draft",
        server_default=text("'draft'"),
        comment="Lifecycle status: 'draft', 'active', 'retired'",
    )
    valid_from: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Effective start date",
    )
    valid_to: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Effective end date (NULL means indefinitely active)",
    )
    created_by: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Creator user email or identity string",
    )
    activated_by: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Approver user email or identity string upon activation",
    )
    activated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when version was activated",
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
    rate_cards: Mapped[list["RateCard"]] = relationship(
        "RateCard",
        back_populates="rate_card_version",
        cascade="all, delete-orphan",
    )


# =============================================================================
# 2. RATE CARDS
# =============================================================================
class RateCard(Base):
    """Commercial pricing for packs or individual features across six dimensions.

    Six pricing dimensions:
      1. rate_card_version_id
      2. country_id
      3. deployment_model_id
      4. pricing_model_id
      5. tier_id (customer_tiers)
      6. uom_id (units_of_measure)

    Target:
      Exactly one of pack_version_id OR feature_id must be non-null.

    Deterministic Lookup:
      Guaranteed by two PostgreSQL partial unique indexes:
      - uq_rate_cards_pack_dims: for pack_version_id IS NOT NULL
      - uq_rate_cards_feature_dims: for feature_id IS NOT NULL
    """

    __tablename__ = "rate_cards"
    __table_args__ = (
        CheckConstraint(
            "(pack_version_id IS NOT NULL AND feature_id IS NULL) OR "
            "(pack_version_id IS NULL AND feature_id IS NOT NULL)",
            name="ck_rate_cards_target_exclusive",
        ),
        CheckConstraint(
            "fixed_fee IS NOT NULL OR unit_rate IS NOT NULL",
            name="ck_rate_cards_fee_component_required",
        ),
        CheckConstraint(
            "fixed_fee IS NULL OR fixed_fee >= 0",
            name="ck_rate_cards_fixed_fee_non_negative",
        ),
        CheckConstraint(
            "unit_rate IS NULL OR unit_rate >= 0",
            name="ck_rate_cards_unit_rate_non_negative",
        ),
        CheckConstraint(
            "floor_price IS NULL OR floor_price >= 0",
            name="ck_rate_cards_floor_price_non_negative",
        ),
        CheckConstraint(
            "cost_fixed IS NULL OR cost_fixed >= 0",
            name="ck_rate_cards_cost_fixed_non_negative",
        ),
        CheckConstraint(
            "cost_unit IS NULL OR cost_unit >= 0",
            name="ck_rate_cards_cost_unit_non_negative",
        ),
        # Partial unique index for pack pricing
        Index(
            "uq_rate_cards_pack_dims",
            "rate_card_version_id",
            "country_id",
            "deployment_model_id",
            "pricing_model_id",
            "tier_id",
            "uom_id",
            "pack_version_id",
            unique=True,
            postgresql_where=text("pack_version_id IS NOT NULL"),
        ),
        # Partial unique index for feature pricing
        Index(
            "uq_rate_cards_feature_dims",
            "rate_card_version_id",
            "country_id",
            "deployment_model_id",
            "pricing_model_id",
            "tier_id",
            "uom_id",
            "feature_id",
            unique=True,
            postgresql_where=text("feature_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    rate_card_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("rate_card_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    country_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("countries.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    deployment_model_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("deployment_models.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    pricing_model_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("pricing_models.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    tier_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("customer_tiers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    uom_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("units_of_measure.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
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
    currency_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("currencies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Monetary amounts (Numeric 18,4)
    fixed_fee: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4),
        nullable=True,
        comment="Base recurring or one-time fixed component",
    )
    unit_rate: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4),
        nullable=True,
        comment="Rate per UOM count (e.g. PEPM)",
    )
    floor_price: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4),
        nullable=True,
        comment="Minimum threshold floor rate below which discounts cannot breach",
    )
    cost_fixed: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4),
        nullable=True,
        comment="Internal COGS fixed base cost",
    )
    cost_unit: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4),
        nullable=True,
        comment="Internal COGS unit cost per UOM",
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
    rate_card_version: Mapped["RateCardVersion"] = relationship(
        "RateCardVersion",
        back_populates="rate_cards",
    )
    country: Mapped["Country"] = relationship("Country")
    deployment_model: Mapped["DeploymentModel"] = relationship("DeploymentModel")
    pricing_model: Mapped["PricingModel"] = relationship("PricingModel")
    tier: Mapped["CustomerTier"] = relationship("CustomerTier")
    uom: Mapped["UnitOfMeasure"] = relationship("UnitOfMeasure")
    pack_version: Mapped[Optional["PackVersion"]] = relationship("PackVersion")
    feature: Mapped[Optional["Feature"]] = relationship("Feature")
    currency: Mapped["Currency"] = relationship("Currency")


# =============================================================================
# 3. SERVICE RATES
# =============================================================================
class ServiceRate(Base):
    """Implementation, consulting, and professional service rates by role and country."""

    __tablename__ = "service_rates"
    __table_args__ = (
        UniqueConstraint(
            "role_name",
            "country_id",
            "valid_from",
            name="uq_service_rates_role_country_valid_from",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_service_rates_status",
        ),
        CheckConstraint(
            "valid_to IS NULL OR valid_to >= valid_from",
            name="ck_service_rates_valid_date_order",
        ),
        CheckConstraint(
            "hourly_rate IS NULL OR hourly_rate >= 0",
            name="ck_service_rates_hourly_rate_non_negative",
        ),
        CheckConstraint(
            "hours_per_day > 0 AND hours_per_day <= 24",
            name="ck_service_rates_hours_per_day_range",
        ),
        CheckConstraint(
            "daily_rate IS NULL OR daily_rate >= 0",
            name="ck_service_rates_daily_rate_non_negative",
        ),
        CheckConstraint(
            "cost_rate IS NULL OR cost_rate >= 0",
            name="ck_service_rates_cost_rate_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    role_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="Professional service role (e.g. Solution Architect, PM, Integration Engineer)",
    )
    country_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("countries.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    hourly_rate: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4),
        nullable=True,
        comment="Standard billable hourly rate",
    )
    hours_per_day: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        default=Decimal("8.00"),
        server_default=text("8.00"),
        comment="Standard working hours per person day (default 8.00)",
    )
    daily_rate: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4),
        nullable=True,
        comment="Explicit daily billing rate; calculated from hourly * hours_per_day if NULL",
    )
    cost_rate: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4),
        nullable=True,
        comment="Internal cost rate per day/hour for margin calculation",
    )
    currency_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("currencies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Billing currency",
    )
    valid_from: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Effective start date",
    )
    valid_to: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Effective end date",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        server_default=text("'active'"),
        comment="Lifecycle status: 'active', 'inactive', 'retired'",
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
    currency: Mapped["Currency"] = relationship("Currency")
