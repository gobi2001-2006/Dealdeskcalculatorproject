from fastapi import FastAPI, HTTPException
from sqlalchemy.exc import SQLAlchemyError

from app.database import test_db_connection

app = FastAPI(title="Adrenalin Deal Desk API")
from app.api.router import api_router

app.include_router(api_router, prefix="/api")

@app.get("/")
def home():
    return {"message": "Adrenalin Deal Desk API is running"}


@app.get("/health/db")
def database_health():
    try:
        result = test_db_connection()
        return {
            "status": "connected",
            "database_test": result,
        }
    except (SQLAlchemyError, RuntimeError, Exception):
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )