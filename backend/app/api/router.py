from fastapi import APIRouter
from .routes import health, catalogue, packs, masters, rates, customers, deals, proposals, hubspot, admin, auth

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(catalogue.router, prefix="/catalogue", tags=["Catalogue"])
api_router.include_router(packs.router, prefix="/packs", tags=["Packs"])
api_router.include_router(masters.router, prefix="/masters", tags=["MasterData"])
api_router.include_router(rates.router, prefix="/rates", tags=["Pricing"])
api_router.include_router(customers.router, prefix="/customers", tags=["Customers"])
api_router.include_router(deals.router, prefix="/deals", tags=["Deals"])
api_router.include_router(proposals.router, prefix="/proposals", tags=["Proposals"])
api_router.include_router(hubspot.router, prefix="/integrations/hubspot", tags=["HubSpot"])
api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
