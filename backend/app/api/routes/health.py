from fastapi import APIRouter

router = APIRouter()

@router.get('/', summary='Health check', response_model=dict)
def health_check():
    return {'status': 'up'}

