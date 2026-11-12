"""Map service-layer domain errors to HTTP responses.

One place decides the status code so every router behaves the same way:
  404 - a referenced record does not exist
  409 - a uniqueness / lifecycle / double-charging conflict
  400 - a business-rule validation failure
Anything else is a genuine server error: it is NOT caught here, so FastAPI returns a
generic 500 without leaking exception text (details are in the server log).
"""

from fastapi import HTTPException, status

from app.services.proposal_service import (
    DealNotFoundError,
    LifecycleStateError,
    ProposalConflictError,
    ProposalNotFoundError,
    ProposalValidationError,
    ResourceNotFoundError,
)

DOMAIN_ERRORS = (
    DealNotFoundError,
    LifecycleStateError,
    ProposalConflictError,
    ProposalNotFoundError,
    ProposalValidationError,
    ResourceNotFoundError,
)


def http_error(exc: Exception) -> HTTPException:
    """Return the HTTPException matching a domain error raised by the service layer."""
    if isinstance(exc, (DealNotFoundError, ProposalNotFoundError, ResourceNotFoundError)):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, (ProposalConflictError, LifecycleStateError)):
        code = status.HTTP_409_CONFLICT
    elif isinstance(exc, ProposalValidationError):
        code = status.HTTP_400_BAD_REQUEST
    else:  # pragma: no cover - guarded by DOMAIN_ERRORS at the call sites
        raise exc
    return HTTPException(status_code=code, detail=str(exc))
