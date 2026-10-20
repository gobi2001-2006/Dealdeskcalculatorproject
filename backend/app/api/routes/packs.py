from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.session import get_db
from app.models.catalogue import Pack, PackItem, PackVersion
from app.schemas.catalogue import (
    PackDetailResponse,
    PackVersionDetailResponse,
)

router = APIRouter()


@router.get(
    "/",
    response_model=list[PackDetailResponse],
    summary="List all packs with their versions",
)
def list_packs(db: Session = Depends(get_db)):
    """Each pack includes its versions, so a client can pick the `pack_version_id` a proposal needs."""
    stmt = select(Pack).options(selectinload(Pack.pack_versions)).order_by(Pack.id)
    return db.execute(stmt).scalars().all()


@router.get(
    "/{pack_version_id}",
    response_model=PackVersionDetailResponse,
    summary="Get pack version detail (with its items)",
)
def get_pack_version(
    pack_version_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
):
    stmt = (
        select(PackVersion)
        .where(PackVersion.id == pack_version_id)
        .options(selectinload(PackVersion.pack_items).selectinload(PackItem.feature))
    )
    pack_version = db.execute(stmt).scalar_one_or_none()
    if not pack_version:
        raise HTTPException(status_code=404, detail="PackVersion not found")
    # PackItem has a composite primary key (pack_version_id, feature_id), so order by feature.
    pack_version.pack_items.sort(key=lambda item: item.feature_id)
    return pack_version
