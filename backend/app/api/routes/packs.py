"""API routes for Pack and Pack Version management (Page 2).

Endpoints:
- GET /api/packs/ — List all packs with their versions
- POST /api/packs/ — Create a new pack bundle (initializes Version 1)
- GET /api/packs/detail/{pack_id} — Get specific pack header & versions
- PATCH /api/packs/{pack_id} — Update pack metadata
- DELETE /api/packs/{pack_id} — Delete a pack
- GET /api/packs/{pack_version_id} — Get pack version details with items
- POST /api/packs/versions — Create a new version for a pack
- POST /api/packs/versions/{pack_version_id}/items/{feature_id} — Add item to pack version
- DELETE /api/packs/versions/{pack_version_id}/items/{feature_id} — Remove item from pack version
"""

from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Body, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.api.errors import DOMAIN_ERRORS, http_error
from app.db.session import get_db
from app.schemas.catalogue import (
    PackCreate,
    PackResponse,
    PackUpdate,
    PackDetailResponse,
    PackVersionCreate,
    PackVersionUpdate,
    PackVersionResponse,
    PackVersionDetailResponse,
    PackItemResponse,
    PackItemInput,
    PackItemUpdate,
    PackItemsSyncRequest,
)
from app.services.catalogue_service import (
    list_packs_service,
    get_pack_service,
    create_pack_service,
    update_pack_service,
    delete_pack_service,
    get_pack_version_service,
    create_pack_version_service,
    update_pack_version_service,
    add_item_to_pack_version,
    remove_item_from_pack_version,
    update_item_in_pack_version,
    sync_pack_version_items_service,
)

router = APIRouter()


class PackCreateWithItems(PackCreate):
    """Payload to create a pack and optionally bundle initial features."""
    initial_version: Optional[int] = Field(default=1, ge=1)
    feature_ids: Optional[List[int]] = Field(default=None, description="Feature IDs to include in Version 1")
    required_feature_ids: Optional[List[int]] = Field(default=None, description="Feature IDs that are required")
    items: Optional[List[PackItemInput]] = Field(default=None, description="Explicit pack items with requirement status")


@router.get(
    "/",
    response_model=List[PackDetailResponse],
    summary="List all packs with their versions",
)
def list_packs_endpoint(
    status: Optional[str] = Query(None, description="Filter by status (active | inactive | retired)"),
    db: Session = Depends(get_db),
):
    """Retrieve all packs including their versions."""
    return list_packs_service(db=db, status=status)


@router.post(
    "/",
    response_model=PackDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new pack bundle",
)
def create_pack_endpoint(
    payload: PackCreateWithItems,
    db: Session = Depends(get_db),
):
    """Create a new pack bundle and initialize Version 1 with selected features."""
    try:
        pack = create_pack_service(
            db=db,
            data=payload,
            initial_version=payload.initial_version,
            feature_ids=payload.feature_ids,
            required_feature_ids=payload.required_feature_ids,
            items=payload.items,
        )
        # Return full pack detail with versions
        return get_pack_service(db=db, pack_id=pack.id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get(
    "/detail/{pack_id}",
    response_model=PackDetailResponse,
    summary="Get pack by ID",
)
def get_pack_endpoint(
    pack_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
):
    """Retrieve pack detail by pack ID."""
    pack = get_pack_service(db=db, pack_id=pack_id)
    if not pack:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pack not found")
    return pack


@router.patch(
    "/{pack_id}",
    response_model=PackResponse,
    summary="Update pack metadata",
)
def update_pack_endpoint(
    pack_id: int = Path(..., gt=0),
    payload: PackUpdate = ...,
    db: Session = Depends(get_db),
):
    """Update pack metadata (name, code, variant, etc.)."""
    try:
        return update_pack_service(db=db, pack_id=pack_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete(
    "/{pack_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a pack",
)
def delete_pack_endpoint(
    pack_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
):
    """Delete a pack and its versions."""
    try:
        delete_pack_service(db=db, pack_id=pack_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get(
    "/{pack_version_id}",
    response_model=PackVersionDetailResponse,
    summary="Get pack version detail (with its items)",
)
def get_pack_version_endpoint(
    pack_version_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
):
    """Get specific pack version and its constituent items."""
    pack_version = get_pack_version_service(db=db, pack_version_id=pack_version_id)
    if not pack_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PackVersion not found")
    return pack_version


@router.post(
    "/versions",
    response_model=PackVersionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new pack version",
)
def create_pack_version_endpoint(
    payload: PackVersionCreate,
    db: Session = Depends(get_db),
):
    """Create a new version under a pack."""
    try:
        return create_pack_version_service(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.patch(
    "/versions/{pack_version_id}",
    response_model=PackVersionResponse,
    summary="Update pack version metadata and status",
)
def update_pack_version_endpoint(
    pack_version_id: int = Path(..., gt=0),
    payload: PackVersionUpdate = ...,
    db: Session = Depends(get_db),
):
    """Update pack version (e.g. status: active | locked | superseded)."""
    try:
        return update_pack_version_service(db=db, pack_version_id=pack_version_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.post(
    "/versions/{pack_version_id}/items/{feature_id}",
    response_model=PackItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add feature to pack version",
)
def add_item_endpoint(
    pack_version_id: int = Path(..., gt=0),
    feature_id: int = Path(..., gt=0),
    is_required: bool = Query(True, description="Whether this feature is required (mandatory) or optional"),
    db: Session = Depends(get_db),
):
    """Add a feature item to a pack version."""
    try:
        return add_item_to_pack_version(
            db=db,
            pack_version_id=pack_version_id,
            feature_id=feature_id,
            is_required=is_required,
        )
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete(
    "/versions/{pack_version_id}/items/{feature_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove feature from pack version",
)
def remove_item_endpoint(
    pack_version_id: int = Path(..., gt=0),
    feature_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
):
    """Remove a feature item from a pack version."""
    try:
        remove_item_from_pack_version(db=db, pack_version_id=pack_version_id, feature_id=feature_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.put(
    "/versions/{pack_version_id}/items",
    response_model=List[PackItemResponse],
    summary="Synchronize all items in a pack version",
)
def sync_items_endpoint(
    pack_version_id: int = Path(..., gt=0),
    payload: Union[List[PackItemInput], PackItemsSyncRequest] = Body(...),
    db: Session = Depends(get_db),
):
    """Synchronize all items in an active or draft pack version with their requirement flags."""
    items = payload.items if isinstance(payload, PackItemsSyncRequest) else payload
    try:
        return sync_pack_version_items_service(db=db, pack_version_id=pack_version_id, items=items)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.patch(
    "/versions/{pack_version_id}/items/{feature_id}",
    response_model=PackItemResponse,
    summary="Update feature requirement status in pack version",
)
def patch_item_endpoint(
    pack_version_id: int = Path(..., gt=0),
    feature_id: int = Path(..., gt=0),
    payload: Optional[PackItemUpdate] = Body(None),
    is_required: Optional[bool] = Query(None, description="Whether this feature is required (mandatory) or optional"),
    db: Session = Depends(get_db),
):
    """Update required status for an existing feature item in a pack version."""
    req_status = True
    if payload is not None and payload.is_required is not None:
        req_status = payload.is_required
    elif is_required is not None:
        req_status = is_required
    try:
        return update_item_in_pack_version(
            db=db,
            pack_version_id=pack_version_id,
            feature_id=feature_id,
            is_required=req_status,
        )
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc
