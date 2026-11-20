"""Approval Inbox endpoints (Phase 3).

Read-only. Decisions keep using POST /api/proposals/{id}/approvals/{approval_id}/decision,
which applies the existing permission and ordering rules and sends the notifications.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services import approval_inbox_service
from app.services.permission_service import require_permission
from app.services.proposal_workflow_service import ProposalWorkflowError

router = APIRouter()
view_perm = require_permission("proposal.view")


@router.get("/inbox", summary="Proposals the signed-in user can see, with what awaits them")
def get_inbox(user_id: Optional[int] = Depends(view_perm), db: Session = Depends(get_db)):
    return approval_inbox_service.list_inbox(db, user_id)


@router.get("/{proposal_id}/my-action", summary="The open stage and whether the signed-in user may decide it")
def get_my_action(
    proposal_id: int = Path(..., gt=0),
    user_id: Optional[int] = Depends(view_perm),
    db: Session = Depends(get_db),
):
    try:
        return approval_inbox_service.can_decide_stage(db, proposal_id, user_id)
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
