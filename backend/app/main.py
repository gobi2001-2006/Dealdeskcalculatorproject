
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, HTTPException
# pyrefly: ignore [missing-import]
from sqlalchemy.exc import SQLAlchemyError

from app.database import test_db_connection

app = FastAPI(title="Adrenalin Deal Desk API")


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
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )
