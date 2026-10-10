"""Model registry for Adrenalin Deal Desk."""

from app.db.base import Base
from app.models.master_data import (
    ContractTerm,
    Country,
    Currency,
    CustomerTier,
    DeploymentModel,
    DeploymentPricingOption,
    FxRate,
    PricingModel,
    UnitOfMeasure,
)
from app.models.catalogue import (
    Feature,
    Pack,
    PackItem,
    PackVersion,
    Product,
    ProductDescription,
    ProductFamily,
)

from app.models.rate_card import (
    RateCard,
    RateCardVersion,
    ServiceRate,
)

from app.models.governance import (
    ApprovalThreshold,
    AuditLog,
    Role,
    User,
    UserRole,
)
from app.models.proposals import (
    Approval,
    CalculationSnapshot,
    Customer,
    Deal,
    Proposal,
    ProposalContact,
    ProposalContent,
    ProposalCountry,
    ProposalLineItem,
    ProposalServiceLine,
    ProposalVersion,
)
from app.models.integrations import (
    Clause,
    ClauseVersion,
    CrmFieldMapping,
    CrmSyncLog,
    Document,
    ProposalClause,
    PublishJob,
)

__all__ = [
    "Base",
    # Wave 1 — Master data (in business flow order)
    "Currency",
    "Country",
    "FxRate",
    "DeploymentModel",
    "PricingModel",
    "CustomerTier",
    "ContractTerm",
    # Wave 1 — Supporting Master dimensions
    "UnitOfMeasure",
    "DeploymentPricingOption",
    # Wave 2 — Catalogue & Packs
    "ProductFamily",
    "Product",
    "Feature",
    "ProductDescription",
    "Pack",
    "PackVersion",
    "PackItem",
    # Wave 3 — Rate Card
    "RateCardVersion",
    "RateCard",
    "ServiceRate",
    # Wave 4 — Users & Governance
    "Role",
    "User",
    "UserRole",
    "ApprovalThreshold",
    "AuditLog",
    # Wave 5 — Proposal & Deal Management
    "Customer",
    "Deal",
    "Proposal",
    "ProposalContact",
    "ProposalVersion",
    "ProposalCountry",
    "ProposalLineItem",
    "ProposalServiceLine",
    "CalculationSnapshot",
    "ProposalContent",
    "Approval",
    # Wave 6 — Documents, Clauses, CRM & Publishing
    "Clause",
    "ClauseVersion",
    "ProposalClause",
    "Document",
    "CrmFieldMapping",
    "CrmSyncLog",
    "PublishJob",
]
