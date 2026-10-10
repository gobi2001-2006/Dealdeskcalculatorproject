"""Master Data Models for Adrenalin Deal Desk.

Defines the core Master data tables in standard business sequence:
1. currencies
2. countries
3. fx_rates
4. deployment_models
5. pricing_models (including units_of_measure and deployment_pricing_options)
6. customer_tiers
7. contract_terms
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

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
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    desc,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# =============================================================================
# 1. CURRENCIES
# =============================================================================
class Currency(Base):
    """ISO 4217 Currencies supported across the platform."""

    __tablename__ = "currencies"
    __table_args__ = (
        UniqueConstraint("code", name="uq_currencies_code"),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_currencies_status",
        ),
        CheckConstraint(
            "decimal_places >= 0 AND decimal_places <= 6",
            name="ck_currencies_decimal_places_range",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    code: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        index=True,
        comment="ISO 4217 currency code",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Currency full display name",
    )
    symbol: Mapped[Optional[str]] = mapped_column(
        String(10),
        nullable=True,
        comment="Currency symbol (e.g. $, EUR)",
    )
    decimal_places: Mapped[int] = mapped_column(
        SmallInteger,
        default=2,
        server_default=text("2"),
        nullable=False,
        comment="Standard decimal precision for display/rounding",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
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
    countries: Mapped[list["Country"]] = relationship(
        "Country",
        back_populates="currency",
        cascade="all, delete-orphan",
    )


# =============================================================================
# 2. COUNTRIES
# =============================================================================
class Country(Base):
    """Country master record with price multiplier and local currency link."""

    __tablename__ = "countries"
    __table_args__ = (
        UniqueConstraint("iso_code", name="uq_countries_iso_code"),
        CheckConstraint(
            "price_multiplier > 0",
            name="ck_countries_price_multiplier_positive",
        ),
        CheckConstraint(
            "valid_to IS NULL OR valid_to > valid_from",
            name="ck_countries_valid_date_order",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_countries_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    iso_code: Mapped[str] = mapped_column(
        String(2),
        nullable=False,
        index=True,
        comment="ISO 3166-1 alpha-2 country code",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    currency_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("currencies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    price_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(10, 6),
        default=Decimal("1.000000"),
        server_default=text("1.000000"),
        nullable=False,
        comment="Regional country pricing multiplier, must be > 0",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
    )
    valid_from: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )
    valid_to: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
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
    currency: Mapped["Currency"] = relationship(
        "Currency",
        back_populates="countries",
    )


# =============================================================================
# 3. FX RATES
# =============================================================================
class FxRate(Base):
    """Foreign exchange rates between currencies with date-effective history."""

    __tablename__ = "fx_rates"
    __table_args__ = (
        UniqueConstraint(
            "from_currency_id",
            "to_currency_id",
            "effective_date",
            name="uq_fx_rates_from_to_effective_date",
        ),
        CheckConstraint(
            "rate > 0",
            name="ck_fx_rates_rate_positive",
        ),
        CheckConstraint(
            "from_currency_id <> to_currency_id",
            name="ck_fx_rates_distinct_currencies",
        ),
        Index(
            "ix_fx_rates_latest_lookup",
            "from_currency_id",
            "to_currency_id",
            desc("effective_date"),
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    from_currency_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("currencies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    to_currency_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("currencies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    rate: Mapped[Decimal] = mapped_column(
        Numeric(18, 8),
        nullable=False,
        comment="Exchange rate: 1 from_currency = rate to_currency, must be > 0",
    )
    rate_source: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Source of rate (e.g. OANDA, Central Bank, Manual)",
    )
    effective_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )
    created_by: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
        comment="User ID who recorded this rate (nullable until user entity implemented)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    from_currency: Mapped["Currency"] = relationship(
        "Currency",
        foreign_keys=[from_currency_id],
    )
    to_currency: Mapped["Currency"] = relationship(
        "Currency",
        foreign_keys=[to_currency_id],
    )


# =============================================================================
# 4. DEPLOYMENT MODELS
# =============================================================================
class DeploymentModel(Base):
    """Hosting/deployment architecture models (shared_cloud, private_cloud, on_premise)."""

    __tablename__ = "deployment_models"
    __table_args__ = (
        UniqueConstraint("code", name="uq_deployment_models_code"),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_deployment_models_status",
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
        comment="Unique identifier code (e.g. shared_cloud, private_cloud, on_premise)",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    cost_basis_flag: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
        comment="Indicates if hosting cost basis applies to this model",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
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
    pricing_options: Mapped[list["DeploymentPricingOption"]] = relationship(
        "DeploymentPricingOption",
        back_populates="deployment_model",
        cascade="all, delete-orphan",
    )


# =============================================================================
# 5. PRICING MODELS & SUPPORTING UNITS OF MEASURE
# =============================================================================
class UnitOfMeasure(Base):
    """Pricing and subscription measurement units (Employee, Candidate, Transaction, Flat)."""

    __tablename__ = "units_of_measure"
    __table_args__ = (
        UniqueConstraint("code", name="uq_units_of_measure_code"),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_units_of_measure_status",
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
        comment="UOM unique code (e.g. employee, candidate, transaction, flat)",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    conversion_rule: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Formula or guidance for unit conversion/scaling",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
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


class PricingModel(Base):
    """Commercial pricing structure models (PEPM, Platform + Subscription, etc.)."""

    __tablename__ = "pricing_models"
    __table_args__ = (
        UniqueConstraint("code", name="uq_pricing_models_code"),
        CheckConstraint(
            "fixed_fee_basis IS NULL OR fixed_fee_basis IN ('annual', 'one_time')",
            name="ck_pricing_models_fixed_fee_basis",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_pricing_models_status",
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
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Approved terminology, e.g. 'Platform + Subscription'",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    has_fixed_component: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
        comment="Requires fixed fee in rate card",
    )
    has_unit_component: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
        comment="Requires unit rate in rate card",
    )
    fixed_fee_basis: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Fixed fee frequency: 'annual' or 'one_time'",
    )
    uom_locked_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("units_of_measure.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        comment="Locked UOM if model strictly prescribes one",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
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
    uom_locked: Mapped[Optional["UnitOfMeasure"]] = relationship(
        "UnitOfMeasure",
    )
    deployment_options: Mapped[list["DeploymentPricingOption"]] = relationship(
        "DeploymentPricingOption",
        back_populates="pricing_model",
        cascade="all, delete-orphan",
    )


class DeploymentPricingOption(Base):
    """Allowed matrix combinations of deployment model and pricing model."""

    __tablename__ = "deployment_pricing_options"

    deployment_model_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("deployment_models.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    pricing_model_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("pricing_models.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    deployment_model: Mapped["DeploymentModel"] = relationship(
        "DeploymentModel",
        back_populates="pricing_options",
    )
    pricing_model: Mapped["PricingModel"] = relationship(
        "PricingModel",
        back_populates="deployment_options",
    )


# =============================================================================
# 6. CUSTOMER TIERS
# =============================================================================
class CustomerTier(Base):
    """Customer volume/headcount bands and default volume multipliers."""

    __tablename__ = "customer_tiers"
    __table_args__ = (
        UniqueConstraint("name", name="uq_customer_tiers_name"),
        CheckConstraint(
            "employee_min >= 0",
            name="ck_customer_tiers_min_non_negative",
        ),
        CheckConstraint(
            "employee_max IS NULL OR employee_max >= employee_min",
            name="ck_customer_tiers_max_gte_min",
        ),
        CheckConstraint(
            "default_multiplier > 0",
            name="ck_customer_tiers_multiplier_positive",
        ),
        CheckConstraint(
            "valid_to IS NULL OR valid_to > valid_from",
            name="ck_customer_tiers_valid_date_order",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_customer_tiers_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    employee_min: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Minimum headcount for tier inclusion (inclusive)",
    )
    employee_max: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Maximum headcount for tier inclusion (inclusive); NULL indicates open-ended top tier",
    )
    default_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(10, 6),
        default=Decimal("1.000000"),
        server_default=text("1.000000"),
        nullable=False,
        comment="Default tier discount/multiplier factor, must be > 0",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
    )
    valid_from: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )
    valid_to: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
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


# =============================================================================
# 7. CONTRACT TERMS
# =============================================================================
class ContractTerm(Base):
    """Standard contract commitment durations and annual renewal escalation rates."""

    __tablename__ = "contract_terms"
    __table_args__ = (
        UniqueConstraint("term_months", name="uq_contract_terms_term_months"),
        CheckConstraint(
            "term_months > 0",
            name="ck_contract_terms_term_months_positive",
        ),
        CheckConstraint(
            "escalation_pct_per_renewal_year >= 0 AND escalation_pct_per_renewal_year <= 100",
            name="ck_contract_terms_escalation_pct_range",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_contract_terms_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    term_months: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Contract duration in months, must be > 0",
    )
    escalation_pct_per_renewal_year: Mapped[Decimal] = mapped_column(
        Numeric(7, 4),
        default=Decimal("0.0000"),
        server_default=text("0.0000"),
        nullable=False,
        comment="Default escalation percentage per renewal year (0.0000 - 100.0000)",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
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
