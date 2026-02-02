from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Query, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Text,
    Float,
    UniqueConstraint,
    Index,
    func,
    or_,
    literal,
    cast,
    inspect,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY, REGCONFIG
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, Session
from sqlalchemy.sql import nulls_last
from typing import List, Optional, Dict, Any, Set
import os
import csv
import json
import math
import re
import time
import threading
import logging
import tempfile
import uuid
from io import StringIO
from datetime import datetime, timedelta
import httpx

# Initialize FastAPI app
app = FastAPI(
    title="Koala API",
    description="API for managing users and authentication in Koala UI.",
    version="1.0.0",
    swagger_ui_parameters={"persistAuthorization": True},
)

logger = logging.getLogger("koala")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("Environment variable DATABASE_URL must be set")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(320), unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)
    role = Column(String(20), nullable=False, default="user")
    created_at = Column(DateTime, default=datetime.utcnow)

    llm_settings = relationship(
        "UserLLMSettings",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan"
    )
    service_credentials = relationship(
        "UserServiceCredential",
        back_populates="user",
        cascade="all, delete-orphan"
    )


class UserLLMSettings(Base):
    __tablename__ = "user_llm_settings"

    user_email = Column(String(320), ForeignKey("users.email", ondelete="CASCADE"), primary_key=True)
    provider = Column(String(64), nullable=True)
    model = Column(String(200), nullable=True)
    endpoint = Column(Text, nullable=True)
    api_key = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("UserDB", back_populates="llm_settings")


class UserServiceCredential(Base):
    __tablename__ = "user_service_credentials"

    id = Column(Integer, primary_key=True)
    user_email = Column(String(320), ForeignKey("users.email", ondelete="CASCADE"), nullable=False, index=True)
    service = Column(String(64), nullable=False)
    base_url = Column(Text, nullable=True)
    api_key = Column(Text, nullable=True)
    llm_api_key = Column(Text, nullable=True)
    model_api_provider = Column(String(64), nullable=True)
    model_name = Column(String(200), nullable=True)
    lamapi_endpoint = Column(Text, nullable=True)
    lamapi_token = Column(Text, nullable=True)
    lamapi_kg = Column(String(64), nullable=True)
    lamapi_num_candidates = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("UserDB", back_populates="service_credentials")

    __table_args__ = (
        UniqueConstraint("user_email", "service", name="uq_user_service"),
    )


class DatasetDB(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True)
    dataset_name = Column(String, nullable=False)
    owner_email = Column(String(320), ForeignKey("users.email", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tables = relationship("TableDB", back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True)

    __table_args__ = (
        UniqueConstraint("owner_email", "dataset_name", name="uq_dataset_owner_name"),
    )


class TableDB(Base):
    __tablename__ = "tables"

    id = Column(Integer, primary_key=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    table_name = Column(String, nullable=False)
    header = Column(JSONB, nullable=False)
    total_rows = Column(Integer, default=0)
    status = Column(String(20), default="READY")
    classified_columns = Column(JSONB, default=dict)
    column_types = Column(JSONB, default=dict)
    classification_status = Column(String(20), default="UNSET")
    moose_job_id = Column(String(64), nullable=True)
    dpv_annotations = Column(JSONB, default=dict)
    dpv_status = Column(String(20), default="UNSET")
    dpv_job_id = Column(String(64), nullable=True)
    recon_column_types_status = Column(String(20), default="UNSET")
    recon_column_types_job_id = Column(String(64), nullable=True)
    recon_column_types_result = Column(JSONB, default=dict)
    recon_column_types_config = Column(JSONB, default=dict)
    recon_column_types_error = Column(JSONB, nullable=True)
    recon_column_types_updated_at = Column(DateTime, nullable=True)
    score_column = Column(Integer, nullable=True)
    score_column_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    dataset = relationship("DatasetDB", back_populates="tables")
    rows = relationship("RowDB", back_populates="table", cascade="all, delete-orphan", passive_deletes=True)
    reconciliation_jobs = relationship(
        "ReconciliationJobDB",
        back_populates="table",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    reconciliation_cells = relationship(
        "ReconciliationCellDB",
        back_populates="table",
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    __table_args__ = (
        UniqueConstraint("dataset_id", "table_name", name="uq_table_dataset_name"),
    )


class RowDB(Base):
    __tablename__ = "table_rows"

    id = Column(Integer, primary_key=True)
    table_id = Column(Integer, ForeignKey("tables.id", ondelete="CASCADE"), nullable=False, index=True)
    id_row = Column(Integer, nullable=False)
    data = Column(JSONB, nullable=False)
    row_score = Column(Float, nullable=True)
    row_types = Column(ARRAY(String), default=list)
    search_blob = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    table = relationship("TableDB", back_populates="rows")

    __table_args__ = (
        UniqueConstraint("table_id", "id_row", name="uq_row_table_idrow"),
    )


class ReconciliationJobDB(Base):
    __tablename__ = "reconciliation_jobs"

    id = Column(Integer, primary_key=True)
    table_id = Column(Integer, ForeignKey("tables.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(64), nullable=False, default="lion_linker")
    external_job_id = Column(String(128), nullable=False)
    status = Column(String(32), nullable=False, default="queued")
    scope = Column(String(32), nullable=True)
    selected_rows = Column(JSONB, default=list)
    selected_columns = Column(JSONB, default=list)
    selected_cells = Column(JSONB, default=list)
    row_map = Column(JSONB, default=list)
    col_map = Column(JSONB, default=list)
    synced_at = Column(DateTime, nullable=True)
    error = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    table = relationship("TableDB", back_populates="reconciliation_jobs")


class ReconciliationCellDB(Base):
    __tablename__ = "reconciliation_cells"

    id = Column(Integer, primary_key=True)
    table_id = Column(Integer, ForeignKey("tables.id", ondelete="CASCADE"), nullable=False, index=True)
    row_id = Column(Integer, nullable=False, index=True)
    col_idx = Column(Integer, nullable=False)
    provider = Column(String(64), nullable=False, default="lion_linker")
    job_id = Column(Integer, ForeignKey("reconciliation_jobs.id", ondelete="SET NULL"), nullable=True)
    external_job_id = Column(String(128), nullable=True)
    mention = Column(Text, nullable=True)
    cell_id = Column(String(128), nullable=True)
    final = Column(JSONB, default=dict)
    candidate_ranking = Column(JSONB, default=list)
    explanation = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    table = relationship("TableDB", back_populates="reconciliation_cells")
    job = relationship("ReconciliationJobDB")

    __table_args__ = (
        UniqueConstraint("table_id", "row_id", "col_idx", "provider", name="uq_recon_cell"),
    )


Index("ix_rows_table_score", RowDB.table_id, RowDB.row_score)
Index("ix_rows_types_gin", RowDB.row_types, postgresql_using="gin")
Index(
    "ix_rows_search_tsv",
    func.to_tsvector(cast(literal("simple"), type_=REGCONFIG), RowDB.search_blob),
    postgresql_using="gin"
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# JWT configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY environment variable is required")


# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


class User(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str


class DatasetCreate(BaseModel):
    dataset_name: str


class ColumnClassificationUpdate(BaseModel):
    classification: Dict[str, Any]


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class LLMSettingsUpdate(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    endpoint: Optional[str] = None
    api_key: Optional[str] = None


class ReconciliationSettingsUpdate(BaseModel):
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    llm_api_key: Optional[str] = None
    model_api_provider: Optional[str] = None
    model_name: Optional[str] = None
    lamapi_endpoint: Optional[str] = None
    lamapi_token: Optional[str] = None
    lamapi_kg: Optional[str] = None
    lamapi_num_candidates: Optional[int] = None


class ReconcileCell(BaseModel):
    row: int
    col: int


class ReconcileRequest(BaseModel):
    provider: Optional[str] = "lion_linker"
    scope: Optional[str] = "page"
    rows: Optional[List[int]] = None
    columns: Optional[List[int]] = None
    cells: Optional[List[ReconcileCell]] = None
    top_k: Optional[int] = None


class ReconciliationCellUpdate(BaseModel):
    row: int
    col: int
    final: Dict[str, Any]
    provider: Optional[str] = None


class ReconciliationColumnTypeComputeRequest(BaseModel):
    provider: Optional[str] = None
    sample_strategy: Optional[str] = "auto"
    sample_size: Optional[int] = None
    max_types: Optional[int] = 10


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role", "user")
        token_type: str = payload.get("type", "access")
        if token_type != "access":
            raise HTTPException(status_code=401, detail="Invalid token")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(UserDB).filter(UserDB.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {"email": user.email, "role": role}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def is_admin_user(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")


def normalize_name(value: str) -> str:
    if not value:
        return ""
    return value.strip()


def normalize_cell(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_optional_value(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


RECONCILIATION_PROVIDERS = {"lion_linker", "crocodile"}


def normalize_reconciliation_provider(value: Optional[str]) -> str:
    provider = normalize_optional_value(value) or "lion_linker"
    if provider not in RECONCILIATION_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported reconciliation provider.")
    return provider


def parse_csv_env(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def get_allowed_llm_providers() -> List[str]:
    configured = parse_csv_env(os.getenv("LLM_ALLOWED_PROVIDERS"))
    if configured:
        return configured
    default_provider = normalize_optional_value(os.getenv("LLM_PROVIDER"))
    if default_provider:
        return [default_provider]
    return ["openrouter", "ollama"]


def get_allowed_llm_endpoints() -> List[str]:
    configured = parse_csv_env(os.getenv("LLM_ALLOWED_ENDPOINTS"))
    if configured:
        return configured
    default_endpoint = normalize_optional_value(os.getenv("LLM_ENDPOINT"))
    if default_endpoint:
        return [default_endpoint]
    return []


def validate_llm_selection(provider: Optional[str], endpoint: Optional[str]) -> None:
    if provider:
        allowed_providers = get_allowed_llm_providers()
        if provider not in allowed_providers:
            raise HTTPException(
                status_code=400,
                detail=f"LLM provider '{provider}' is not supported."
            )
    if endpoint:
        allowed_endpoints = get_allowed_llm_endpoints()
        if not allowed_endpoints or endpoint not in allowed_endpoints:
            raise HTTPException(
                status_code=400,
                detail="LLM endpoint is not supported."
            )

MOOSE_DEFAULT_SCHEMA = "sti"
MOOSE_DEFAULT_INCLUDE_SCORES = True
MOOSE_DEFAULT_SAMPLE_SIZE = 25
MOOSE_REQUEST_TIMEOUT_SECONDS = 30
MOOSE_POLL_INTERVAL_SECONDS = 2
MOOSE_POLL_TIMEOUT_SECONDS = 120

LION_DEFAULT_BASE_URL = "https://lion.zooverse.dev"
LION_REQUEST_TIMEOUT_SECONDS = 30
LION_POLL_INTERVAL_SECONDS = 2
LION_POLL_TIMEOUT_SECONDS = 300
LION_INLINE_ROW_LIMIT = 200
LION_UPLOAD_TIMEOUT_SECONDS = 300
LION_LAMAPI_CLASS_PATH = "lion_linker.retrievers.LamapiClient"

CROCODILE_DEFAULT_BASE_URL = "https://crocodile.zooverse.dev"
CROCODILE_REQUEST_TIMEOUT_SECONDS = 30
CROCODILE_POLL_INTERVAL_SECONDS = 2
CROCODILE_POLL_TIMEOUT_SECONDS = 300

RECON_COLUMN_TYPES_SAMPLE_DEFAULT = 5000
RECON_COLUMN_TYPES_SAMPLE_MAX = 50000
RECON_COLUMN_TYPES_MAX_TYPES_DEFAULT = 10
RECON_COLUMN_TYPES_STRATEGIES = {"auto", "latest", "random", "all"}


def load_llm_config(
    provider_override: Optional[str] = None,
    model_override: Optional[str] = None,
    user_settings: Optional[UserLLMSettings] = None
) -> Dict[str, Any]:
    provider = normalize_optional_value(provider_override)
    model = normalize_optional_value(model_override)
    endpoint_override = normalize_optional_value(os.getenv("LLM_ENDPOINT"))

    if not provider and user_settings and user_settings.provider:
        provider = user_settings.provider
    if not model and user_settings and user_settings.model:
        model = user_settings.model

    endpoint = None
    if user_settings and user_settings.endpoint:
        endpoint = user_settings.endpoint
    else:
        endpoint = endpoint_override

    validate_llm_selection(provider, endpoint)

    api_key = None
    if user_settings and user_settings.api_key:
        api_key = normalize_optional_value(user_settings.api_key)
    if not api_key:
        api_key = normalize_optional_value(os.getenv("LLM_API_KEY"))

    missing = []
    if not provider:
        missing.append("LLM_PROVIDER")
    if not model:
        missing.append("LLM_MODEL")
    requires_key = provider and provider.lower() != "ollama"
    if requires_key and not api_key:
        missing.append("LLM_API_KEY")

    return {
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "endpoint": endpoint,
        "missing": missing
    }


def load_moose_config(
    llm_provider_override: Optional[str] = None,
    llm_model_override: Optional[str] = None,
    user_settings: Optional[UserLLMSettings] = None
) -> Dict[str, Any]:
    base_url = (os.getenv("MOOSE_BASE_URL") or "https://moose.zooverse.dev").rstrip("/")
    api_key = os.getenv("MOOSE_API_KEY")
    llm_config = load_llm_config(llm_provider_override, llm_model_override, user_settings)

    missing = []
    if not api_key:
        missing.append("MOOSE_API_KEY")
    missing.extend(llm_config["missing"])

    return {
        "base_url": base_url,
        "api_key": api_key,
        "llm_provider": llm_config["provider"],
        "llm_model": llm_config["model"],
        "llm_api_key": llm_config["api_key"],
        "llm_endpoint": llm_config["endpoint"],
        "schema": MOOSE_DEFAULT_SCHEMA,
        "include_scores": MOOSE_DEFAULT_INCLUDE_SCORES,
        "sample_size": MOOSE_DEFAULT_SAMPLE_SIZE,
        "request_timeout": MOOSE_REQUEST_TIMEOUT_SECONDS,
        "poll_interval": MOOSE_POLL_INTERVAL_SECONDS,
        "poll_timeout": MOOSE_POLL_TIMEOUT_SECONDS,
        "missing": missing
    }


def build_moose_headers(config: Dict[str, Any]) -> Dict[str, str]:
    headers = {
        "Accept": "application/json",
        "X-API-Key": config["api_key"]
    }
    if config.get("llm_api_key"):
        headers["X-LLM-API-Key"] = config["llm_api_key"]
    if config.get("llm_endpoint"):
        headers["X-LLM-Endpoint"] = config["llm_endpoint"]
    return headers


def load_moose_status_config() -> Dict[str, Any]:
    base_url = (os.getenv("MOOSE_BASE_URL") or "https://moose.zooverse.dev").rstrip("/")
    api_key = os.getenv("MOOSE_API_KEY")
    missing = []
    if not api_key:
        missing.append("MOOSE_API_KEY")
    return {
        "base_url": base_url,
        "api_key": api_key,
        "request_timeout": MOOSE_REQUEST_TIMEOUT_SECONDS,
        "missing": missing
    }


def load_lion_config(
    db: Session,
    user_email: str
) -> Dict[str, Any]:
    credentials = get_user_service_credentials(db, user_email, "lion_linker")
    base_url = normalize_optional_value(credentials.base_url) if credentials and credentials.base_url else None
    if not base_url:
        base_url = (os.getenv("LION_LINKER_BASE_URL") or LION_DEFAULT_BASE_URL).rstrip("/")
    else:
        base_url = base_url.rstrip("/")
    api_key = normalize_optional_value(credentials.api_key) if credentials and credentials.api_key else None
    llm_api_key = normalize_optional_value(credentials.llm_api_key) if credentials and credentials.llm_api_key else None
    if not api_key:
        api_key = normalize_optional_value(os.getenv("LION_LINKER_API_KEY"))
    if not llm_api_key:
        llm_api_key = normalize_optional_value(os.getenv("LION_LINKER_LLM_API_KEY"))

    missing = []
    if not api_key:
        missing.append("Lion Linker API key")
    if not llm_api_key:
        missing.append("Lion Linker LLM API key")

    return {
        "base_url": base_url,
        "api_key": api_key,
        "llm_api_key": llm_api_key,
        "request_timeout": LION_REQUEST_TIMEOUT_SECONDS,
        "poll_interval": LION_POLL_INTERVAL_SECONDS,
        "poll_timeout": LION_POLL_TIMEOUT_SECONDS,
        "missing": missing
    }


def load_lion_retriever_config(
    db: Session,
    user_email: str
) -> Dict[str, Any]:
    credentials = get_user_service_credentials(db, user_email, "lion_linker")
    endpoint = normalize_optional_value(credentials.lamapi_endpoint) if credentials and credentials.lamapi_endpoint else None
    token = normalize_optional_value(credentials.lamapi_token) if credentials and credentials.lamapi_token else None
    kg = normalize_optional_value(credentials.lamapi_kg) if credentials and credentials.lamapi_kg else None
    num_candidates = credentials.lamapi_num_candidates if credentials and credentials.lamapi_num_candidates else None
    model_api_provider = (
        normalize_optional_value(credentials.model_api_provider)
        if credentials and credentials.model_api_provider
        else None
    )
    model_name = normalize_optional_value(credentials.model_name) if credentials and credentials.model_name else None

    if not endpoint:
        endpoint = normalize_optional_value(os.getenv("LION_LINKER_LAMAPI_ENDPOINT"))
    if not token:
        token = normalize_optional_value(os.getenv("LION_LINKER_LAMAPI_TOKEN"))
    if not kg:
        kg = normalize_optional_value(os.getenv("LION_LINKER_LAMAPI_KG"))
    if num_candidates is None:
        raw_num = normalize_optional_value(os.getenv("LION_LINKER_LAMAPI_NUM_CANDIDATES"))
        if raw_num:
            try:
                num_candidates = int(raw_num)
            except ValueError:
                num_candidates = None
    if not model_api_provider:
        model_api_provider = normalize_optional_value(os.getenv("LION_LINKER_MODEL_API_PROVIDER"))
    if not model_name:
        model_name = normalize_optional_value(os.getenv("LION_LINKER_MODEL_NAME"))

    missing = []
    if not endpoint:
        missing.append("Lamapi endpoint")
    if not token:
        missing.append("Lamapi token")

    return {
        "endpoint": endpoint,
        "token": token,
        "kg": kg or "wikidata",
        "num_candidates": num_candidates or 10,
        "model_api_provider": model_api_provider,
        "model_name": model_name,
        "missing": missing
    }


def load_crocodile_config(
    db: Session,
    user_email: str
) -> Dict[str, Any]:
    credentials = get_user_service_credentials(db, user_email, "crocodile")
    base_url = normalize_optional_value(credentials.base_url) if credentials and credentials.base_url else None
    if not base_url:
        base_url = (os.getenv("CROCODILE_BASE_URL") or CROCODILE_DEFAULT_BASE_URL).rstrip("/")
    else:
        base_url = base_url.rstrip("/")
    api_key = normalize_optional_value(credentials.api_key) if credentials and credentials.api_key else None
    if not api_key:
        api_key = normalize_optional_value(os.getenv("CROCODILE_API_KEY"))

    missing = []
    if not api_key:
        missing.append("Crocodile API key")

    return {
        "base_url": base_url,
        "api_key": api_key,
        "request_timeout": CROCODILE_REQUEST_TIMEOUT_SECONDS,
        "poll_interval": CROCODILE_POLL_INTERVAL_SECONDS,
        "poll_timeout": CROCODILE_POLL_TIMEOUT_SECONDS,
        "missing": missing
    }


def build_lion_headers(config: Dict[str, Any]) -> Dict[str, str]:
    headers = {
        "Accept": "application/json",
        "X-API-Key": config["api_key"]
    }
    if config.get("llm_api_key"):
        headers["X-LLM-API-Key"] = config["llm_api_key"]
    return headers


def build_crocodile_headers(config: Dict[str, Any]) -> Dict[str, str]:
    return {
        "Accept": "application/json",
        "X-API-Key": config["api_key"]
    }


def create_lion_job(config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{config['base_url']}/jobs"
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.post(url, json=payload, headers=build_lion_headers(config))
    response.raise_for_status()
    return response.json()


def get_lion_job_status(config: Dict[str, Any], job_id: str) -> Dict[str, Any]:
    url = f"{config['base_url']}/jobs/{job_id}"
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.get(url, headers=build_lion_headers(config))
    response.raise_for_status()
    return response.json()


def get_lion_job_results(
    config: Dict[str, Any],
    job_id: str,
    cursor: Optional[str] = None,
    limit: int = 200
) -> Dict[str, Any]:
    url = f"{config['base_url']}/jobs/{job_id}/results"
    params: Dict[str, Any] = {"limit": limit}
    if cursor:
        params["cursor"] = cursor
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.get(url, headers=build_lion_headers(config), params=params)
    response.raise_for_status()
    return response.json()


def create_crocodile_job(config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{config['base_url']}/jobs"
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.post(url, json=payload, headers=build_crocodile_headers(config))
    response.raise_for_status()
    return response.json()


def get_crocodile_job_status(config: Dict[str, Any], job_id: str) -> Dict[str, Any]:
    url = f"{config['base_url']}/jobs/{job_id}"
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.get(url, headers=build_crocodile_headers(config))
    response.raise_for_status()
    return response.json()


def get_crocodile_job_results(
    config: Dict[str, Any],
    job_id: str,
    cursor: Optional[str] = None,
    limit: int = 200
) -> Dict[str, Any]:
    url = f"{config['base_url']}/jobs/{job_id}/results"
    params: Dict[str, Any] = {"limit": limit}
    if cursor:
        params["cursor"] = cursor
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.get(url, headers=build_crocodile_headers(config), params=params)
    response.raise_for_status()
    return response.json()


def serialize_reconciliation_settings(db: Session, user_email: str) -> Dict[str, Any]:
    lion_credentials = get_user_service_credentials(db, user_email, "lion_linker")
    crocodile_credentials = get_user_service_credentials(db, user_email, "crocodile")
    server_api_key = normalize_optional_value(os.getenv("LION_LINKER_API_KEY"))
    server_llm_key = normalize_optional_value(os.getenv("LION_LINKER_LLM_API_KEY"))
    croc_server_key = normalize_optional_value(os.getenv("CROCODILE_API_KEY"))
    retriever_config = load_lion_retriever_config(db, user_email)
    lion_base_url = (
        normalize_optional_value(lion_credentials.base_url)
        if lion_credentials and lion_credentials.base_url
        else None
    )
    if not lion_base_url:
        lion_base_url = (os.getenv("LION_LINKER_BASE_URL") or LION_DEFAULT_BASE_URL).rstrip("/")
    else:
        lion_base_url = lion_base_url.rstrip("/")
    crocodile_base_url = (
        normalize_optional_value(crocodile_credentials.base_url)
        if crocodile_credentials and crocodile_credentials.base_url
        else None
    )
    if not crocodile_base_url:
        crocodile_base_url = (os.getenv("CROCODILE_BASE_URL") or CROCODILE_DEFAULT_BASE_URL).rstrip("/")
    else:
        crocodile_base_url = crocodile_base_url.rstrip("/")

    lion_payload = {
        "base_url": lion_base_url,
        "has_api_key": bool((lion_credentials and lion_credentials.api_key) or server_api_key),
        "has_llm_api_key": bool((lion_credentials and lion_credentials.llm_api_key) or server_llm_key),
        "has_lamapi_token": bool(retriever_config.get("token")),
        "model_api_provider": retriever_config.get("model_api_provider"),
        "model_name": retriever_config.get("model_name"),
        "lamapi_endpoint": retriever_config.get("endpoint"),
        "lamapi_kg": retriever_config.get("kg"),
        "lamapi_num_candidates": retriever_config.get("num_candidates")
    }

    crocodile_payload = {
        "base_url": crocodile_base_url,
        "has_api_key": bool(
            (crocodile_credentials and crocodile_credentials.api_key) or croc_server_key
        )
    }

    return {
        "provider": "lion_linker",
        "available_providers": ["lion_linker", "crocodile"],
        "lion_base_url": lion_base_url,
        "crocodile_base_url": crocodile_base_url,
        "has_api_key": lion_payload["has_api_key"],
        "has_llm_api_key": lion_payload["has_llm_api_key"],
        "has_lamapi_token": lion_payload["has_lamapi_token"],
        "model_api_provider": lion_payload["model_api_provider"],
        "model_name": lion_payload["model_name"],
        "lamapi_endpoint": lion_payload["lamapi_endpoint"],
        "lamapi_kg": lion_payload["lamapi_kg"],
        "lamapi_num_candidates": lion_payload["lamapi_num_candidates"],
        "crocodile_has_api_key": crocodile_payload["has_api_key"],
        "lion_linker": lion_payload,
        "crocodile": crocodile_payload
    }


def create_lion_upload(config: Dict[str, Any], content_length: int, content_type: str) -> Dict[str, Any]:
    url = f"{config['base_url']}/uploads"
    payload = {
        "content_type": content_type,
        "content_length": content_length
    }
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.post(url, json=payload, headers=build_lion_headers(config))
    response.raise_for_status()
    return response.json()


def upload_lion_content(upload_url: str, data: bytes) -> None:
    with httpx.Client(timeout=LION_REQUEST_TIMEOUT_SECONDS) as client:
        response = client.put(upload_url, content=data)
    response.raise_for_status()


def upload_lion_file(upload_url: str, file_path: str) -> None:
    with open(file_path, "rb") as handle:
        with httpx.Client(timeout=LION_UPLOAD_TIMEOUT_SECONDS) as client:
            response = client.put(upload_url, content=handle)
    response.raise_for_status()


def get_moose_job_status(config: Dict[str, Any], job_id: str) -> Dict[str, Any]:
    url = f"{config['base_url']}/jobs/{job_id}"
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.get(url, headers=build_moose_headers(config))
    response.raise_for_status()
    return response.json()


def build_sampled_rows(
    db: Session,
    table_id: int,
    header: List[str],
    sample_size: int
) -> List[Dict[str, Any]]:
    rows = (
        db.query(RowDB)
        .filter(RowDB.table_id == table_id)
        .order_by(RowDB.id_row.asc())
        .limit(sample_size)
        .all()
    )
    sampled_rows: List[Dict[str, Any]] = []
    for row in rows:
        data = row.data or []
        row_payload = {}
        for idx, column_name in enumerate(header):
            if idx < len(data):
                row_payload[column_name] = data[idx]
        if row_payload:
            sampled_rows.append(row_payload)
    return sampled_rows


def submit_moose_tabular_job(
    config: Dict[str, Any],
    sampled_rows: List[Dict[str, Any]],
    dataset_name: str,
    table_name: str,
    schema_override: Optional[str] = None
) -> str:
    if not sampled_rows:
        raise HTTPException(status_code=400, detail="No rows available for auto-identification.")

    payload = {
        "tasks": [
            {
                "task_id": f"{dataset_name}:{table_name}",
                "table_id": f"{dataset_name}.{table_name}",
                "sampled_rows": sampled_rows
            }
        ],
        "schema": schema_override or config["schema"],
        "include_scores": config["include_scores"],
        "llm": {
            "provider": config["llm_provider"],
            "model": config["llm_model"]
        }
    }

    url = f"{config['base_url']}/tabular/annotate"
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.post(url, json=payload, headers=build_moose_headers(config))

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Moose request failed ({response.status_code})."
        )

    data = response.json()
    job_id = data.get("job_id")
    if not job_id:
        raise HTTPException(status_code=502, detail="Moose did not return a job_id.")
    return job_id


def poll_moose_job(config: Dict[str, Any], job_id: str) -> Dict[str, Any]:
    url = f"{config['base_url']}/jobs/{job_id}"
    deadline = time.time() + config["poll_timeout"]
    with httpx.Client(timeout=config["request_timeout"]) as client:
        while time.time() < deadline:
            response = client.get(url, headers=build_moose_headers(config))
            response.raise_for_status()
            payload = response.json()
            status = (payload.get("status") or "").lower()
            if status == "completed":
                return payload
            if status in {"failed", "error"}:
                raise RuntimeError(f"Moose job {job_id} failed with status '{status}'.")
            time.sleep(config["poll_interval"])
    raise TimeoutError(f"Moose job {job_id} did not complete in time.")


def extract_moose_classification(
    header: List[str],
    job_payload: Dict[str, Any]
) -> Dict[str, Dict[int, str]]:
    classification = {"NE": {}, "LIT": {}}
    header_lookup = {
        normalize_name(name).lower(): idx
        for idx, name in enumerate(header)
    }
    results = (job_payload.get("result") or {}).get("results") or []
    for result in results:
        columns = result.get("columns") or []
        for column in columns:
            column_name = normalize_name(column.get("column") or "")
            if not column_name:
                continue
            idx = header_lookup.get(column_name.lower())
            if idx is None:
                continue
            type_id = column.get("type_id") or column.get("coarse_type_id")
            if not type_id:
                continue
            type_id = str(type_id)
            coarse_type = str(column.get("coarse_type_id") or "")
            group = "NE" if type_id.startswith("NE:") or coarse_type.startswith("NE:") else "LIT"
            if group == "LIT":
                classification[group][idx] = {
                    "type_id": type_id,
                    "coarse_type_id": column.get("coarse_type_id") or type_id
                }
            else:
                classification[group][idx] = type_id
    return classification


def extract_moose_dpv_annotations(
    header: List[str],
    job_payload: Dict[str, Any]
) -> Dict[int, Dict[str, Any]]:
    annotations: Dict[int, Dict[str, Any]] = {}
    header_lookup = {
        normalize_name(name).lower(): idx
        for idx, name in enumerate(header)
    }
    results = (job_payload.get("result") or {}).get("results") or []
    for result in results:
        columns = result.get("columns") or []
        for column in columns:
            column_name = normalize_name(column.get("column") or "")
            if not column_name:
                continue
            idx = header_lookup.get(column_name.lower())
            if idx is None:
                continue
            type_id = column.get("type_id")
            if not type_id:
                continue
            annotations[idx] = {
                "type_id": str(type_id),
                "confidence": column.get("confidence"),
                "distribution": column.get("distribution")
            }
    return annotations


def apply_column_classification(
    db: Session,
    table: TableDB,
    classification: Dict[str, Dict[int, str]],
    classification_status: str
) -> None:
    header = table.header or []
    score_column = detect_score_column(header)

    column_counts = {
        idx: 0 for idx in set(
            list(classification.get("NE", {}).keys()) + list(classification.get("LIT", {}).keys())
        )
    }
    total_rows = 0
    updates = []
    batch_size = 1000
    now = datetime.utcnow()

    query = (
        db.query(RowDB)
        .filter(RowDB.table_id == table.id)
        .order_by(RowDB.id_row.asc())
    )

    for row in query.yield_per(batch_size):
        data = row.data or []
        total_rows += 1
        for idx in column_counts:
            if idx < len(data) and normalize_cell(data[idx]):
                column_counts[idx] += 1
        row_score = (
            parse_score_value(data[score_column])
            if score_column is not None and score_column < len(data)
            else None
        )
        updates.append({
            "id": row.id,
            "row_score": row_score,
            "updated_at": now
        })

        if len(updates) >= batch_size:
            db.bulk_update_mappings(RowDB, updates)
            db.commit()
            updates = []

    if updates:
        db.bulk_update_mappings(RowDB, updates)
        db.commit()

    column_types = build_column_type_summary_from_counts(header, classification, total_rows, column_counts)

    table.classified_columns = classification
    table.column_types = column_types
    table.classification_status = classification_status
    table.score_column = score_column
    table.score_column_name = header[score_column] if score_column is not None else None
    table.updated_at = now
    db.commit()


def apply_dpv_annotations(
    db: Session,
    table: TableDB,
    annotations: Dict[int, Dict[str, Any]],
    status: str
) -> None:
    table.dpv_annotations = annotations
    table.dpv_status = status
    table.updated_at = datetime.utcnow()
    db.commit()


def build_row_type_summary(
    db: Session,
    table_id: int,
    total_rows: int,
    excluded_types: Optional[Set[str]] = None
) -> List[Dict[str, Any]]:
    if total_rows <= 0:
        return []
    type_counts = (
        db.query(
            func.unnest(RowDB.row_types).label("type_id"),
            func.count().label("count")
        )
        .filter(RowDB.table_id == table_id, RowDB.row_types.isnot(None))
        .group_by("type_id")
        .order_by(func.count().desc())
        .all()
    )
    summary: List[Dict[str, Any]] = []
    for type_id, count in type_counts:
        if not type_id:
            continue
        if excluded_types and type_id in excluded_types:
            continue
        summary.append({
            "id": type_id,
            "name": type_id,
            "count": count,
            "frequency": count / total_rows if total_rows else 0
        })
    return summary


def process_moose_job(table_id: int, job_id: str, config: Dict[str, Any]) -> None:
    if config.get("missing"):
        logger.error("Moose config missing for job %s: %s", job_id, ", ".join(config["missing"]))
        db = SessionLocal()
        try:
            table = db.query(TableDB).filter(TableDB.id == table_id).first()
            if table:
                table.classification_status = "AUTO_FAILED"
                table.updated_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()
        return

    db = SessionLocal()
    try:
        table = db.query(TableDB).filter(TableDB.id == table_id).first()
        if not table:
            logger.warning("Table %s not found for Moose job %s.", table_id, job_id)
            return

        try:
            payload = poll_moose_job(config, job_id)
            classification = extract_moose_classification(table.header or [], payload)
            if not classification.get("NE") and not classification.get("LIT"):
                table.classification_status = "AUTO_FAILED"
                table.updated_at = datetime.utcnow()
                db.commit()
                logger.warning("Moose job %s returned no usable classifications.", job_id)
                return
            apply_column_classification(db, table, classification, "AUTO")
            table.moose_job_id = None
            table.updated_at = datetime.utcnow()
            db.commit()
        except Exception as exc:
            table.classification_status = "AUTO_FAILED"
            table.moose_job_id = None
            table.updated_at = datetime.utcnow()
            db.commit()
            logger.exception("Moose job %s failed: %s", job_id, exc)
    finally:
        db.close()


def process_dpv_job(table_id: int, job_id: str, config: Dict[str, Any]) -> None:
    if config.get("missing"):
        logger.error("Moose config missing for DPV job %s: %s", job_id, ", ".join(config["missing"]))
        db = SessionLocal()
        try:
            table = db.query(TableDB).filter(TableDB.id == table_id).first()
            if table:
                table.dpv_status = "DPV_FAILED"
                table.dpv_job_id = None
                table.updated_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()
        return

    db = SessionLocal()
    try:
        table = db.query(TableDB).filter(TableDB.id == table_id).first()
        if not table:
            logger.warning("Table %s not found for DPV job %s.", table_id, job_id)
            return

        try:
            payload = poll_moose_job(config, job_id)
            annotations = extract_moose_dpv_annotations(table.header or [], payload)
            if not annotations:
                table.dpv_status = "DPV_FAILED"
                table.dpv_job_id = None
                table.updated_at = datetime.utcnow()
                db.commit()
                logger.warning("DPV job %s returned no usable annotations.", job_id)
                return
            apply_dpv_annotations(db, table, annotations, "DPV")
            table.dpv_job_id = None
            table.updated_at = datetime.utcnow()
            db.commit()
        except Exception as exc:
            table.dpv_status = "DPV_FAILED"
            table.dpv_job_id = None
            table.updated_at = datetime.utcnow()
            db.commit()
            logger.exception("DPV job %s failed: %s", job_id, exc)
    finally:
        db.close()


def launch_moose_job(table_id: int, job_id: str, config: Dict[str, Any]) -> None:
    worker = threading.Thread(
        target=process_moose_job,
        args=(table_id, job_id, config),
        daemon=True
    )
    worker.start()


def launch_dpv_job(table_id: int, job_id: str, config: Dict[str, Any]) -> None:
    worker = threading.Thread(
        target=process_dpv_job,
        args=(table_id, job_id, config),
        daemon=True
    )
    worker.start()


def map_reconciliation_row(job: ReconciliationJobDB, row_index: Optional[int]) -> Optional[int]:
    if row_index is None:
        return None
    try:
        row_value = int(row_index)
    except (TypeError, ValueError):
        return None
    if job.row_map:
        if 0 <= row_value < len(job.row_map):
            try:
                return int(job.row_map[row_value])
            except (TypeError, ValueError):
                return None
        if row_value in job.row_map:
            return row_value
    return row_value


def map_reconciliation_col(
    job: ReconciliationJobDB,
    col_index: Optional[Any],
    header_map: Optional[Dict[str, int]] = None,
    header_map_lower: Optional[Dict[str, int]] = None
) -> Optional[int]:
    if col_index is None:
        return None

    def resolve_numeric(value: Any) -> Optional[int]:
        try:
            col_value = int(value)
        except (TypeError, ValueError):
            return None
        if job.col_map:
            if 0 <= col_value < len(job.col_map):
                try:
                    return int(job.col_map[col_value])
                except (TypeError, ValueError):
                    return None
            if col_value in job.col_map:
                return col_value
        return col_value

    if isinstance(col_index, str):
        stripped = col_index.strip()
        if stripped:
            numeric = resolve_numeric(stripped)
            if numeric is not None:
                return numeric
            if header_map and stripped in header_map:
                return header_map[stripped]
            lowered = stripped.lower()
            if header_map_lower and lowered in header_map_lower:
                return header_map_lower[lowered]
        return None

    return resolve_numeric(col_index)


def get_ne_column_indices(table: TableDB) -> Set[int]:
    classified = table.classified_columns or {}
    ne_entries = classified.get("NE", {}) if isinstance(classified, dict) else {}
    ne_indices: Set[int] = set()
    if isinstance(ne_entries, dict):
        for key in ne_entries.keys():
            try:
                ne_indices.add(int(key))
            except (TypeError, ValueError):
                continue
    return ne_indices


def normalize_type_entries(value: Any) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return []
    normalized: List[Dict[str, str]] = []
    seen: Set[str] = set()
    for entry in value:
        type_id = None
        type_name = None
        if isinstance(entry, dict):
            type_id = entry.get("id") or entry.get("entity_id")
            type_name = entry.get("name") or entry.get("label")
        elif entry is not None:
            type_name = str(entry).strip()
        type_id = str(type_id).strip() if type_id is not None else ""
        type_name = str(type_name).strip() if type_name is not None else ""
        if not type_id and not type_name:
            continue
        key = type_id or type_name.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append({
            "id": type_id,
            "name": type_name
        })
    return normalized


def parse_confidence_score(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        score = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(score):
        return None
    return max(0.0, min(score, 1.0))


def choose_reconciliation_candidate(cell: ReconciliationCellDB) -> Optional[Dict[str, Any]]:
    final = cell.final if isinstance(cell.final, dict) else {}
    ranking = cell.candidate_ranking if isinstance(cell.candidate_ranking, list) else []

    final_types = normalize_type_entries(final.get("types"))
    if final_types:
        score = parse_confidence_score(final.get("confidence_score") or final.get("score"))
        return {
            "source": "final",
            "types": final_types,
            "score": score,
            "match": final.get("match") is True
        }

    candidate = None
    if ranking:
        candidate = next(
            (entry for entry in ranking if isinstance(entry, dict) and entry.get("match") is True),
            None
        )
        source = "match" if candidate else "top1"
        if candidate is None:
            candidate = ranking[0] if isinstance(ranking[0], dict) else None
        if candidate:
            metadata = candidate.get("metadata")
            metadata = metadata if isinstance(metadata, dict) else {}
            candidate_types = normalize_type_entries(candidate.get("types") or metadata.get("types"))
            if candidate_types:
                score = parse_confidence_score(candidate.get("confidence_score") or candidate.get("score"))
                return {
                    "source": source,
                    "types": candidate_types,
                    "score": score,
                    "match": candidate.get("match") is True
                }
    return None


def compute_candidate_weight(evidence: Dict[str, Any], provider: str) -> float:
    base_score = evidence.get("score")
    source = evidence.get("source")
    if source == "final":
        weight = base_score if base_score is not None else 1.0
        weight = max(weight, 0.9)
    elif source == "match":
        weight = base_score if base_score is not None else 0.8
        weight = max(weight, 0.6)
    else:
        seed = base_score if base_score is not None else 0.5
        weight = max(0.05, seed * 0.35)

    provider_weight = 1.0
    if provider == "lion_linker":
        provider_weight = 1.0
    elif provider == "crocodile":
        provider_weight = 0.98
    return max(0.01, min(weight * provider_weight, 1.5))


def build_reconciliation_column_type_ranking(
    db: Session,
    table: TableDB,
    provider: Optional[str] = None,
    max_types_per_column: int = RECON_COLUMN_TYPES_MAX_TYPES_DEFAULT,
    sample_strategy: str = "auto",
    sample_size: int = RECON_COLUMN_TYPES_SAMPLE_DEFAULT
) -> Dict[str, Any]:
    header = table.header or []
    ne_indices = get_ne_column_indices(table)
    resolved_strategy = sample_strategy if sample_strategy in RECON_COLUMN_TYPES_STRATEGIES else "auto"
    resolved_sample_size = max(1, min(int(sample_size or RECON_COLUMN_TYPES_SAMPLE_DEFAULT), RECON_COLUMN_TYPES_SAMPLE_MAX))
    if not ne_indices:
        return {
            "strategy": "weighted_majority_vote",
            "provider": provider or "all",
            "sampling": {
                "strategy": resolved_strategy,
                "sample_size": resolved_sample_size,
                "total_cells": 0,
                "sampled_cells": 0,
                "sampled": False
            },
            "columns": {}
        }

    query = (
        db.query(ReconciliationCellDB)
        .filter(
            ReconciliationCellDB.table_id == table.id,
            ReconciliationCellDB.col_idx.in_(list(ne_indices))
        )
    )
    if provider:
        query = query.filter(ReconciliationCellDB.provider == provider)

    total_cells = query.count()
    effective_strategy = resolved_strategy
    sampled = False
    sampled_cells_target = total_cells

    if resolved_strategy == "all":
        effective_strategy = "all"
    elif resolved_strategy == "random":
        effective_strategy = "random"
        sampled_cells_target = min(total_cells, resolved_sample_size)
        sampled = total_cells > sampled_cells_target
    elif resolved_strategy == "latest":
        effective_strategy = "latest"
        sampled_cells_target = min(total_cells, resolved_sample_size)
        sampled = total_cells > sampled_cells_target
    else:
        if total_cells <= resolved_sample_size:
            effective_strategy = "all"
        else:
            effective_strategy = "latest"
            sampled = True
            sampled_cells_target = resolved_sample_size

    if effective_strategy == "random":
        ordered_query = query.order_by(func.random())
    else:
        ordered_query = query.order_by(
            ReconciliationCellDB.updated_at.desc().nulls_last(),
            ReconciliationCellDB.id.desc()
        )
    if effective_strategy == "all":
        cells = ordered_query.all()
    else:
        cells = ordered_query.limit(sampled_cells_target).all()
    sampled_cells = len(cells)

    column_stats: Dict[int, Dict[str, Any]] = {}
    for idx in ne_indices:
        if idx < 0 or idx >= len(header):
            continue
        column_stats[idx] = {
            "header": header[idx],
            "evidence_cells": 0,
            "unmatched_cells": 0,
            "total_entity_weight": 0.0,
            "total_type_weight": 0.0,
            "type_votes": {},
            "provider_breakdown": {}
        }

    for cell in cells:
        col_idx = cell.col_idx
        if col_idx not in column_stats:
            continue
        evidence = choose_reconciliation_candidate(cell)
        if not evidence:
            continue
        column_entry = column_stats[col_idx]
        provider_name = cell.provider or "unknown"
        provider_entry = column_entry["provider_breakdown"].setdefault(
            provider_name,
            {"cells": 0, "weighted_score": 0.0, "type_weight": 0.0}
        )
        column_entry["evidence_cells"] += 1
        if evidence.get("match") is not True:
            column_entry["unmatched_cells"] += 1
        weight = compute_candidate_weight(evidence, provider_name)
        type_entries = evidence.get("types") or []
        if not type_entries:
            continue
        column_entry["total_entity_weight"] += weight
        column_entry["total_type_weight"] += weight * len(type_entries)
        provider_entry["cells"] += 1
        provider_entry["weighted_score"] += weight
        provider_entry["type_weight"] += weight * len(type_entries)

        for type_entry in type_entries:
            type_key = type_entry.get("id") or type_entry.get("name")
            if not type_key:
                continue
            vote_entry = column_entry["type_votes"].setdefault(
                type_key,
                {
                    "id": type_entry.get("id") or None,
                    "name": type_entry.get("name") or type_entry.get("id") or "Unknown",
                    "score": 0.0,
                    "support": 0
                }
            )
            vote_entry["score"] += weight
            vote_entry["support"] += 1

    columns_payload: Dict[str, Any] = {}
    for col_idx, entry in column_stats.items():
        votes = list(entry["type_votes"].values())
        votes.sort(key=lambda item: (item["score"], item["support"]), reverse=True)
        evidence_cells = entry["evidence_cells"] or 0
        total_entity_weight = entry["total_entity_weight"] or 0.0
        total_type_weight = entry["total_type_weight"] or 0.0
        ranking = []
        for vote in votes[:max_types_per_column]:
            probability = (vote["score"] / total_type_weight) if total_type_weight > 0 else 0.0
            frequency = (vote["support"] / evidence_cells) if evidence_cells > 0 else 0.0
            ranking.append({
                "id": vote["id"],
                "name": vote["name"],
                "weighted_score": round(vote["score"], 6),
                "probability": round(probability, 6),
                "frequency": round(frequency, 6),
                "support": vote["support"]
            })

        top_choice = ranking[0] if ranking else None
        provider_breakdown = {}
        for provider_name, provider_values in entry["provider_breakdown"].items():
            provider_breakdown[provider_name] = {
                "cells": provider_values["cells"],
                "weighted_score": round(provider_values["weighted_score"], 6),
                "type_weight": round(provider_values["type_weight"], 6)
            }

        columns_payload[str(col_idx)] = {
            "column_index": col_idx,
            "header": entry["header"],
            "evidence_cells": entry["evidence_cells"],
            "unmatched_cells": entry["unmatched_cells"],
            "total_weight": round(total_type_weight, 6),
            "total_entity_weight": round(total_entity_weight, 6),
            "total_type_weight": round(total_type_weight, 6),
            "top_type": top_choice,
            "ranking": ranking,
            "provider_breakdown": provider_breakdown
        }

    return {
        "strategy": "weighted_majority_vote",
        "provider": provider or "all",
        "sampling": {
            "strategy": effective_strategy,
            "requested_strategy": resolved_strategy,
            "sample_size": resolved_sample_size,
            "total_cells": total_cells,
            "sampled_cells": sampled_cells,
            "sampled": sampled
        },
        "computed_at": datetime.utcnow().isoformat(),
        "columns": columns_payload
    }


def mark_reconciliation_column_types_stale(db: Session, table_id: int) -> None:
    table = db.query(TableDB).filter(TableDB.id == table_id).first()
    if not table:
        return
    table.recon_column_types_status = "STALE"
    table.updated_at = datetime.utcnow()


def sync_lion_results(
    db: Session,
    job: ReconciliationJobDB,
    config: Dict[str, Any]
) -> None:
    cursor = None
    while True:
        payload = get_lion_job_results(config, job.external_job_id, cursor=cursor, limit=200)
        results = payload.get("results") or []
        for entry in results:
            row_idx = entry.get("row")
            col_idx = entry.get("col")
            mapped_row = map_reconciliation_row(job, row_idx)
            mapped_col = map_reconciliation_col(job, col_idx)
            if mapped_row is None or mapped_col is None:
                continue
            cell = (
                db.query(ReconciliationCellDB)
                .filter(
                    ReconciliationCellDB.table_id == job.table_id,
                    ReconciliationCellDB.row_id == mapped_row,
                    ReconciliationCellDB.col_idx == mapped_col,
                    ReconciliationCellDB.provider == job.provider
                )
                .first()
            )
            if not cell:
                cell = ReconciliationCellDB(
                    table_id=job.table_id,
                    row_id=mapped_row,
                    col_idx=mapped_col,
                    provider=job.provider
                )
                db.add(cell)
            candidate_ranking = entry.get("candidate_ranking") or []
            final_value = entry.get("final") or {}
            if not final_value and candidate_ranking:
                winning = next(
                    (candidate for candidate in candidate_ranking if candidate.get("match") is True),
                    None
                )
                if winning:
                    final_value = {
                        "id": winning.get("id"),
                        "name": winning.get("name"),
                        "types": winning.get("types"),
                        "description": winning.get("description"),
                        "confidence_label": winning.get("confidence_label"),
                        "confidence_score": winning.get("confidence_score"),
                        "match": winning.get("match")
                    }
            cell.job_id = job.id
            cell.external_job_id = job.external_job_id
            cell.mention = entry.get("mention")
            cell.cell_id = entry.get("cell_id")
            cell.final = final_value
            cell.candidate_ranking = candidate_ranking
            cell.explanation = entry.get("explanation")
            cell.updated_at = datetime.utcnow()
        db.commit()
        cursor = payload.get("next_cursor")
        if not cursor:
            break

    mark_reconciliation_column_types_stale(db, job.table_id)
    job.synced_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    db.commit()


def sync_crocodile_results(
    db: Session,
    job: ReconciliationJobDB,
    config: Dict[str, Any]
) -> None:
    cursor = None
    table = db.query(TableDB).filter(TableDB.id == job.table_id).first()
    header = table.header if table else []
    selected_columns = job.selected_columns or []
    header_map: Dict[str, int] = {}
    header_map_lower: Dict[str, int] = {}
    for idx in selected_columns:
        if idx is None or idx >= len(header) or idx < 0:
            continue
        name = str(header[idx])
        header_map[name] = idx
        header_map_lower[name.strip().lower()] = idx

    while True:
        payload = get_crocodile_job_results(config, job.external_job_id, cursor=cursor, limit=200)
        results = payload.get("results") or []
        for entry in results:
            row_idx = entry.get("row_id", entry.get("row"))
            col_idx = entry.get("col_id", entry.get("col"))
            mapped_row = map_reconciliation_row(job, row_idx)
            mapped_col = map_reconciliation_col(job, col_idx, header_map, header_map_lower)
            if mapped_row is None or mapped_col is None:
                continue
            cell = (
                db.query(ReconciliationCellDB)
                .filter(
                    ReconciliationCellDB.table_id == job.table_id,
                    ReconciliationCellDB.row_id == mapped_row,
                    ReconciliationCellDB.col_idx == mapped_col,
                    ReconciliationCellDB.provider == job.provider
                )
                .first()
            )
            if not cell:
                cell = ReconciliationCellDB(
                    table_id=job.table_id,
                    row_id=mapped_row,
                    col_idx=mapped_col,
                    provider=job.provider
                )
                db.add(cell)

            raw_ranking = entry.get("candidate_ranking")
            candidate_ranking: List[Dict[str, Any]] = []
            if isinstance(raw_ranking, list):
                for rank, candidate in enumerate(raw_ranking, start=1):
                    metadata = candidate.get("metadata")
                    metadata = metadata if isinstance(metadata, dict) else {}
                    types = candidate.get("types")
                    if not isinstance(types, list):
                        types = metadata.get("types")
                    if not isinstance(types, list):
                        types = []
                    score_value = candidate.get("confidence_score")
                    if score_value is None:
                        score_value = candidate.get("score")
                    candidate_ranking.append({
                        "rank": candidate.get("rank", rank),
                        "id": candidate.get("id") or candidate.get("entity_id"),
                        "name": candidate.get("name") or candidate.get("label"),
                        "label": candidate.get("label"),
                        "confidence_label": candidate.get("confidence_label"),
                        "confidence_score": score_value,
                        "score": candidate.get("score", score_value),
                        "description": candidate.get("description") or metadata.get("description"),
                        "types": types,
                        "match": candidate.get("match"),
                        "metadata": metadata
                    })
            else:
                candidates = entry.get("candidates") or []
                for rank, candidate in enumerate(candidates, start=1):
                    metadata = candidate.get("metadata")
                    metadata = metadata if isinstance(metadata, dict) else {}
                    candidate_ranking.append({
                        "rank": rank,
                        "id": candidate.get("entity_id") or candidate.get("id"),
                        "name": candidate.get("label") or candidate.get("name"),
                        "label": candidate.get("label"),
                        "confidence_label": candidate.get("confidence_label"),
                        "confidence_score": candidate.get("score"),
                        "score": candidate.get("score"),
                        "description": metadata.get("description") or candidate.get("description"),
                        "types": metadata.get("types") or candidate.get("types") or [],
                        "match": candidate.get("match"),
                        "metadata": metadata
                    })

            final_value = entry.get("final") or {}
            if not final_value and candidate_ranking:
                winning = next(
                    (candidate for candidate in candidate_ranking if candidate.get("match") is True),
                    None
                )
                if winning:
                    final_value = {
                        "id": winning.get("id"),
                        "name": winning.get("name") or winning.get("label"),
                        "types": winning.get("types"),
                        "description": winning.get("description"),
                        "confidence_label": winning.get("confidence_label"),
                        "confidence_score": winning.get("confidence_score") or winning.get("score"),
                        "match": True
                    }

            cell.job_id = job.id
            cell.external_job_id = job.external_job_id
            cell.mention = entry.get("mention")
            cell.cell_id = entry.get("cell_id")
            cell.final = final_value
            cell.candidate_ranking = candidate_ranking
            entry_meta = entry.get("meta")
            entry_meta = entry_meta if isinstance(entry_meta, dict) else {}
            cell.explanation = entry.get("explanation") or entry_meta.get("explanation")
            cell.updated_at = datetime.utcnow()
        db.commit()

        cursor = payload.get("next_cursor")
        has_more = payload.get("has_more")
        if not cursor:
            if not has_more:
                break
            break

    mark_reconciliation_column_types_stale(db, job.table_id)
    job.synced_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    db.commit()


def process_reconciliation_sync(job_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.query(ReconciliationJobDB).filter(ReconciliationJobDB.id == job_id).first()
        if not job:
            logger.warning("Reconciliation job %s not found for sync.", job_id)
            return
        table = db.query(TableDB).filter(TableDB.id == job.table_id).first()
        if not table:
            logger.warning("Table %s not found for reconciliation sync %s.", job.table_id, job_id)
            return
        dataset = db.query(DatasetDB).filter(DatasetDB.id == table.dataset_id).first()
        if not dataset:
            logger.warning("Dataset not found for reconciliation sync %s.", job_id)
            return
        provider = job.provider or "lion_linker"
        if provider == "lion_linker":
            config = load_lion_config(db, dataset.owner_email)
            if config["missing"]:
                job.status = "error"
                job.error = {"detail": "Missing Lion Linker configuration", "missing": config["missing"]}
                job.updated_at = datetime.utcnow()
                db.commit()
                return
            sync_lion_results(db, job, config)
        elif provider == "crocodile":
            config = load_crocodile_config(db, dataset.owner_email)
            if config["missing"]:
                job.status = "error"
                job.error = {"detail": "Missing Crocodile configuration", "missing": config["missing"]}
                job.updated_at = datetime.utcnow()
                db.commit()
                return
            sync_crocodile_results(db, job, config)
        else:
            job.status = "error"
            job.error = {"detail": f"Unsupported reconciliation provider '{provider}'."}
            job.updated_at = datetime.utcnow()
            db.commit()
            return
    except Exception as exc:
        logger.exception("Reconciliation sync %s failed: %s", job_id, exc)
    finally:
        db.close()


def launch_reconciliation_sync(job_id: int) -> None:
    worker = threading.Thread(
        target=process_reconciliation_sync,
        args=(job_id,),
        daemon=True
    )
    worker.start()


def process_reconciliation_job(job_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.query(ReconciliationJobDB).filter(ReconciliationJobDB.id == job_id).first()
        if not job:
            logger.warning("Reconciliation job %s not found.", job_id)
            return
        table = db.query(TableDB).filter(TableDB.id == job.table_id).first()
        if not table:
            logger.warning("Table %s not found for reconciliation job %s.", job.table_id, job_id)
            return
        dataset = db.query(DatasetDB).filter(DatasetDB.id == table.dataset_id).first()
        if not dataset:
            logger.warning("Dataset not found for reconciliation job %s.", job_id)
            return

        provider = job.provider or "lion_linker"
        if provider == "lion_linker":
            config = load_lion_config(db, dataset.owner_email)
            if config["missing"]:
                job.status = "error"
                job.error = {"detail": "Missing Lion Linker configuration", "missing": config["missing"]}
                job.updated_at = datetime.utcnow()
                db.commit()
                return

            success_statuses = {"completed", "succeeded", "success", "done", "finished"}
            failure_statuses = {"failed", "error", "canceled", "cancelled"}
            deadline = time.time() + config["poll_timeout"]
            while time.time() < deadline:
                payload = get_lion_job_status(config, job.external_job_id)
                status = (payload.get("status") or "").lower()
                if status:
                    job.status = status
                    job.updated_at = datetime.utcnow()
                    db.commit()
                if status in success_statuses:
                    try:
                        sync_lion_results(db, job, config)
                    except Exception as exc:
                        job.status = "sync_failed"
                        job.error = {"detail": str(exc)}
                        job.updated_at = datetime.utcnow()
                        db.commit()
                    return
                if status in failure_statuses:
                    job.error = payload.get("error") or {"detail": f"Job ended with status '{status}'."}
                    job.updated_at = datetime.utcnow()
                    db.commit()
                    return
                time.sleep(config["poll_interval"])
            job.status = "timeout"
            job.error = {"detail": "Reconciliation job timed out."}
            job.updated_at = datetime.utcnow()
            db.commit()
            return

        if provider == "crocodile":
            config = load_crocodile_config(db, dataset.owner_email)
            if config["missing"]:
                job.status = "error"
                job.error = {"detail": "Missing Crocodile configuration", "missing": config["missing"]}
                job.updated_at = datetime.utcnow()
                db.commit()
                return

            success_statuses = {"done", "completed", "succeeded", "success", "finished"}
            failure_statuses = {"failed", "error", "canceled", "cancelled"}
            deadline = time.time() + config["poll_timeout"]
            while time.time() < deadline:
                payload = get_crocodile_job_status(config, job.external_job_id)
                status = (payload.get("status") or "").lower()
                if status:
                    job.status = status
                    job.updated_at = datetime.utcnow()
                    db.commit()
                if status in success_statuses:
                    try:
                        sync_crocodile_results(db, job, config)
                    except Exception as exc:
                        job.status = "sync_failed"
                        job.error = {"detail": str(exc)}
                        job.updated_at = datetime.utcnow()
                        db.commit()
                    return
                if status in failure_statuses:
                    job.error = payload.get("error") or {"detail": f"Job ended with status '{status}'."}
                    job.updated_at = datetime.utcnow()
                    db.commit()
                    return
                time.sleep(config["poll_interval"])
            job.status = "timeout"
            job.error = {"detail": "Reconciliation job timed out."}
            job.updated_at = datetime.utcnow()
            db.commit()
            return

        job.status = "error"
        job.error = {"detail": f"Unsupported reconciliation provider '{provider}'."}
        job.updated_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        logger.exception("Reconciliation job %s failed: %s", job_id, exc)
    finally:
        db.close()


def launch_reconciliation_job(job_id: int) -> None:
    worker = threading.Thread(
        target=process_reconciliation_job,
        args=(job_id,),
        daemon=True
    )
    worker.start()


def get_dataset_or_404(dataset_name: str, owner: str, db: Session) -> DatasetDB:
    dataset = (
        db.query(DatasetDB)
        .filter(DatasetDB.owner_email == owner, DatasetDB.dataset_name == dataset_name)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")
    return dataset


def get_table_or_404(dataset_name: str, table_name: str, owner: str, db: Session) -> TableDB:
    table = (
        db.query(TableDB)
        .join(DatasetDB, TableDB.dataset_id == DatasetDB.id)
        .filter(
            DatasetDB.owner_email == owner,
            DatasetDB.dataset_name == dataset_name,
            TableDB.table_name == table_name
        )
        .first()
    )
    if not table:
        raise HTTPException(
            status_code=404,
            detail=f"Table '{table_name}' not found in dataset '{dataset_name}'"
        )
    return table


def get_user_llm_settings(db: Session, email: str) -> Optional[UserLLMSettings]:
    return db.query(UserLLMSettings).filter(UserLLMSettings.user_email == email).first()


def get_user_service_credentials(
    db: Session,
    email: str,
    service: str
) -> Optional[UserServiceCredential]:
    return (
        db.query(UserServiceCredential)
        .filter(
            UserServiceCredential.user_email == email,
            UserServiceCredential.service == service
        )
        .first()
    )


def serialize_row(row: RowDB) -> Dict[str, Any]:
    return {
        "idRow": row.id_row,
        "data": row.data or [],
        "row_score": row.row_score,
        "row_types": row.row_types or []
    }


def build_reconciliation_inline_table(
    header: List[str],
    rows: List[RowDB],
    selected_columns: List[int],
    cell_whitelist: Optional[Set[tuple]] = None
) -> Dict[str, Any]:
    selected_header = [header[idx] for idx in selected_columns]
    inline_rows = []
    for idx, row in enumerate(rows):
        row_cells = []
        data = row.data or []
        for col_idx in selected_columns:
            value = data[col_idx] if col_idx < len(data) else ""
            if cell_whitelist is not None and (row.id_row, col_idx) not in cell_whitelist:
                value = ""
            row_cells.append(value)
        inline_rows.append({
            "row_id": idx,
            "cells": row_cells
        })
    return {
        "header": selected_header,
        "rows": inline_rows
    }


def build_reconciliation_csv_bytes(
    header: List[str],
    rows: List[RowDB],
    selected_columns: List[int],
    cell_whitelist: Optional[Set[tuple]] = None
) -> bytes:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([header[idx] for idx in selected_columns])
    for row in rows:
        data = row.data or []
        row_cells = []
        for col_idx in selected_columns:
            value = data[col_idx] if col_idx < len(data) else ""
            if cell_whitelist is not None and (row.id_row, col_idx) not in cell_whitelist:
                value = ""
            row_cells.append(value)
        writer.writerow(row_cells)
    return output.getvalue().encode("utf-8")


def build_reconciliation_csv_file(
    header: List[str],
    rows: List[RowDB],
    selected_columns: List[int],
    cell_whitelist: Optional[Set[tuple]] = None
) -> Dict[str, Any]:
    tmp = tempfile.NamedTemporaryFile(mode="w", newline="", encoding="utf-8", delete=False)
    try:
        writer = csv.writer(tmp)
        writer.writerow([header[idx] for idx in selected_columns])
        for row in rows:
            data = row.data or []
            row_cells = []
            for col_idx in selected_columns:
                value = data[col_idx] if col_idx < len(data) else ""
                if cell_whitelist is not None and (row.id_row, col_idx) not in cell_whitelist:
                    value = ""
                row_cells.append(value)
            writer.writerow(row_cells)
        tmp.flush()
    finally:
        tmp.close()
    size_bytes = os.path.getsize(tmp.name)
    return {"path": tmp.name, "size": size_bytes}


def build_pagination(page: int, per_page: int, total: int) -> Dict[str, Any]:
    total_pages = max(1, math.ceil(total / per_page)) if total else 1
    has_next = page < total_pages
    has_prev = page > 1
    return {
        "currentPage": page,
        "perPage": per_page,
        "totalPages": total_pages,
        "totalRows": total,
        "next_cursor": str(page + 1) if has_next else None,
        "prev_cursor": str(page - 1) if has_prev else None
    }


def resolve_page(page: int, next_cursor: Optional[str], prev_cursor: Optional[str]) -> int:
    if next_cursor:
        try:
            return max(1, int(next_cursor))
        except ValueError:
            pass
    if prev_cursor:
        try:
            return max(1, int(prev_cursor))
        except ValueError:
            pass
    return max(1, page)


def parse_column_classification(raw_value: Optional[Any], header_length: int) -> Dict[str, Dict[int, str]]:
    if not raw_value:
        return {"NE": {}, "LIT": {}}
    if isinstance(raw_value, dict):
        payload = raw_value
    else:
        try:
            payload = json.loads(raw_value)
        except json.JSONDecodeError as ex:
            raise HTTPException(status_code=400, detail=f"Invalid column classification JSON: {ex}") from ex

    result = {"NE": {}, "LIT": {}}

    if isinstance(payload, dict) and ("NE" in payload or "LIT" in payload):
        for group_key in ("NE", "LIT"):
            raw_group = payload.get(group_key) or {}
            if not isinstance(raw_group, dict):
                continue
            for key, subtype in raw_group.items():
                try:
                    idx = int(key)
                except (TypeError, ValueError):
                    continue
                if 0 <= idx < header_length and subtype:
                    result[group_key][idx] = str(subtype)
        return result

    if isinstance(payload, dict):
        for key, value in payload.items():
            try:
                idx = int(key)
            except (TypeError, ValueError):
                continue
            if idx < 0 or idx >= header_length:
                continue
            col_type = (value or {}).get("type")
            subtype = (value or {}).get("subtype")
            if col_type == "NE":
                result["NE"][idx] = subtype or "NE"
            elif col_type == "LIT":
                result["LIT"][idx] = subtype or "LIT"
    return result


def detect_score_column(header: List[str]) -> Optional[int]:
    score_keywords = ("score", "confidence", "rank")
    for idx, name in enumerate(header):
        normalized = normalize_name(name).lower()
        if normalized and any(keyword in normalized for keyword in score_keywords):
            return idx
    return None


def parse_score_value(raw_value: Any) -> Optional[float]:
    if raw_value is None:
        return None
    if isinstance(raw_value, (int, float)):
        return float(raw_value)
    text = normalize_cell(raw_value)
    if not text:
        return None
    cleaned = re.sub(r"[^\d\.\-]", "", text)
    if cleaned in {"", "-", ".", "-."}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def build_row_types(row: List[Any], classification: Dict[str, Dict[int, str]]) -> List[str]:
    row_types: List[str] = []
    if not classification:
        return row_types
    for idx, subtype in classification.get("NE", {}).items():
        if idx < len(row) and normalize_cell(row[idx]):
            row_types.append(subtype)
    for idx, subtype in classification.get("LIT", {}).items():
        if idx < len(row) and normalize_cell(row[idx]):
            row_types.append(subtype)
    return list(dict.fromkeys(row_types))


def extract_classification_value(value: Any, prefer_coarse: bool = False) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, dict):
        if prefer_coarse:
            for key in ("coarse_type_id", "coarse", "coarse_type", "coarseType", "coarseTypeId"):
                if value.get(key):
                    return str(value[key])
        for key in ("type_id", "specific", "type", "subtype", "value"):
            if value.get(key):
                return str(value[key])
        for item in value.values():
            if isinstance(item, str) and item:
                return item
        return None
    return str(value)


def build_column_type_summary_from_counts(
    header: List[str],
    classification: Dict[str, Dict[int, str]],
    total_rows: int,
    counts_by_column: Dict[int, int]
) -> Dict[int, Dict[str, Any]]:
    summary: Dict[int, Dict[str, Any]] = {}
    for idx in range(len(header)):
        types = []
        ne_value = extract_classification_value(classification.get("NE", {}).get(idx))
        lit_value = extract_classification_value(classification.get("LIT", {}).get(idx), prefer_coarse=True)
        count = counts_by_column.get(idx, 0)
        if ne_value:
            types.append({
                "id": ne_value,
                "name": ne_value,
                "count": count,
                "frequency": count / total_rows if total_rows else 0
            })
        if lit_value and not ne_value:
            types.append({
                "id": lit_value,
                "name": lit_value,
                "count": count,
                "frequency": count / total_rows if total_rows else 0
            })
        if types:
            summary[idx] = {"types": types}
    return summary


@app.on_event("startup")
def create_tables():
    Base.metadata.create_all(bind=engine)


@app.on_event("startup")
def ensure_tables_schema():
    inspector = inspect(engine)
    if "tables" not in inspector.get_table_names():
        return
    existing_columns = {col["name"] for col in inspector.get_columns("tables")}
    if "moose_job_id" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS moose_job_id VARCHAR(64)"))
    if "dpv_annotations" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS dpv_annotations JSONB"))
    if "dpv_status" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS dpv_status VARCHAR(20)"))
    if "dpv_job_id" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS dpv_job_id VARCHAR(64)"))
    if "recon_column_types_status" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS recon_column_types_status VARCHAR(20)"))
    if "recon_column_types_job_id" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS recon_column_types_job_id VARCHAR(64)"))
    if "recon_column_types_result" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS recon_column_types_result JSONB"))
    if "recon_column_types_config" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS recon_column_types_config JSONB"))
    if "recon_column_types_error" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS recon_column_types_error JSONB"))
    if "recon_column_types_updated_at" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tables ADD COLUMN IF NOT EXISTS recon_column_types_updated_at TIMESTAMP"))


@app.on_event("startup")
def ensure_user_llm_settings_schema():
    inspector = inspect(engine)
    if "user_llm_settings" not in inspector.get_table_names():
        return
    existing_columns = {col["name"] for col in inspector.get_columns("user_llm_settings")}
    if "api_key" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE user_llm_settings ADD COLUMN IF NOT EXISTS api_key TEXT"))


@app.on_event("startup")
def ensure_user_service_credentials_schema():
    inspector = inspect(engine)
    if "user_service_credentials" not in inspector.get_table_names():
        return
    existing_columns = {col["name"] for col in inspector.get_columns("user_service_credentials")}
    columns_to_add = {
        "base_url": "TEXT",
        "api_key": "TEXT",
        "llm_api_key": "TEXT",
        "model_api_provider": "VARCHAR(64)",
        "model_name": "VARCHAR(200)",
        "lamapi_endpoint": "TEXT",
        "lamapi_token": "TEXT",
        "lamapi_kg": "VARCHAR(64)",
        "lamapi_num_candidates": "INTEGER"
    }
    for column, ddl in columns_to_add.items():
        if column not in existing_columns:
            with engine.begin() as conn:
                conn.execute(
                    text(f"ALTER TABLE user_service_credentials ADD COLUMN IF NOT EXISTS {column} {ddl}")
                )


@app.on_event("startup")
def ensure_reconciliation_cells_schema():
    inspector = inspect(engine)
    if "reconciliation_cells" not in inspector.get_table_names():
        return
    existing_columns = {col["name"] for col in inspector.get_columns("reconciliation_cells")}
    columns_to_add = {
        "candidate_ranking": "JSONB",
        "explanation": "TEXT"
    }
    for column, ddl in columns_to_add.items():
        if column not in existing_columns:
            with engine.begin() as conn:
                conn.execute(
                    text(f"ALTER TABLE reconciliation_cells ADD COLUMN IF NOT EXISTS {column} {ddl}")
                )


@app.on_event("startup")
def create_admin_user():
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")

    if not admin_email or not admin_password:
        print("Admin credentials not provided in environment variables.")
        return

    db = SessionLocal()
    try:
        existing = db.query(UserDB).filter(UserDB.email == admin_email).first()
        hashed_password = get_password_hash(admin_password)
        if not existing:
            db.add(UserDB(email=admin_email, password=hashed_password, role="admin"))
            db.commit()
            print(f"Admin user '{admin_email}' created successfully.")
        else:
            updated = False
            if not verify_password(admin_password, existing.password):
                existing.password = hashed_password
                updated = True
            if existing.role != "admin":
                existing.role = "admin"
                updated = True
            if updated:
                db.commit()
                print(f"Admin user '{admin_email}' updated successfully.")
            else:
                print(f"Admin user '{admin_email}' already exists.")
    finally:
        db.close()


@app.post("/register", response_model=dict)
def register(user: User, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    is_admin_user(current_user)

    existing = db.query(UserDB).filter(UserDB.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    hashed_password = get_password_hash(user.password)
    db.add(UserDB(email=user.email, password=hashed_password))
    db.commit()
    return {"msg": "User created successfully"}


@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    refresh_token = create_refresh_token(data={"sub": user.email, "role": user.role})
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@app.post("/refresh", response_model=Token)
def refresh_access_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    try:
        token_payload = jwt.decode(payload.refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        token_type: str = token_payload.get("type")
        if token_type != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        email: str = token_payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(UserDB).filter(UserDB.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access_token = create_access_token(data={"sub": user.email, "role": user.role})
        return {"access_token": access_token, "refresh_token": payload.refresh_token, "token_type": "bearer"}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/users/me/llm-settings", response_model=dict)
def get_llm_settings(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    settings = get_user_llm_settings(db, current_user["email"])
    return {
        "provider": settings.provider if settings else None,
        "model": settings.model if settings else None,
        "endpoint": settings.endpoint if settings else None,
        "has_api_key": bool(settings.api_key) if settings else False,
        "allowed_providers": get_allowed_llm_providers(),
        "allowed_endpoints": get_allowed_llm_endpoints()
    }


@app.put("/users/me/llm-settings", response_model=dict)
def update_llm_settings(
    payload: LLMSettingsUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    provider = normalize_optional_value(payload.provider)
    model = normalize_optional_value(payload.model)
    endpoint = normalize_optional_value(payload.endpoint)

    validate_llm_selection(provider, endpoint)

    settings = get_user_llm_settings(db, current_user["email"])
    if not settings:
        settings = UserLLMSettings(user_email=current_user["email"])
        db.add(settings)

    if payload.provider is not None:
        settings.provider = provider
    if payload.model is not None:
        settings.model = model
    if payload.endpoint is not None:
        settings.endpoint = endpoint
    if payload.api_key is not None:
        settings.api_key = normalize_optional_value(payload.api_key)

    settings.updated_at = datetime.utcnow()
    db.commit()

    return {
        "provider": settings.provider,
        "model": settings.model,
        "endpoint": settings.endpoint,
        "has_api_key": bool(settings.api_key)
    }


@app.get("/users/me/reconciliation-settings", response_model=dict)
def get_reconciliation_settings(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return serialize_reconciliation_settings(db, current_user["email"])


@app.put("/users/me/reconciliation-settings", response_model=dict)
def update_reconciliation_settings(
    payload: ReconciliationSettingsUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    provider = normalize_reconciliation_provider(payload.provider)

    credentials = get_user_service_credentials(db, current_user["email"], provider)
    if not credentials:
        credentials = UserServiceCredential(user_email=current_user["email"], service=provider)
        db.add(credentials)

    if payload.base_url is not None:
        credentials.base_url = normalize_optional_value(payload.base_url)
    if payload.api_key is not None:
        credentials.api_key = normalize_optional_value(payload.api_key)
    if provider == "lion_linker":
        if payload.llm_api_key is not None:
            credentials.llm_api_key = normalize_optional_value(payload.llm_api_key)
        if payload.model_api_provider is not None:
            credentials.model_api_provider = normalize_optional_value(payload.model_api_provider)
        if payload.model_name is not None:
            credentials.model_name = normalize_optional_value(payload.model_name)
        if payload.lamapi_endpoint is not None:
            credentials.lamapi_endpoint = normalize_optional_value(payload.lamapi_endpoint)
        if payload.lamapi_token is not None:
            credentials.lamapi_token = normalize_optional_value(payload.lamapi_token)
        if payload.lamapi_kg is not None:
            credentials.lamapi_kg = normalize_optional_value(payload.lamapi_kg)
        if payload.lamapi_num_candidates is not None:
            credentials.lamapi_num_candidates = payload.lamapi_num_candidates

    credentials.updated_at = datetime.utcnow()
    db.commit()

    return serialize_reconciliation_settings(db, current_user["email"])


@app.post("/upload-users", response_model=dict)
def upload_users(file: UploadFile = File(...), current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    is_admin_user(current_user)

    try:
        content = file.file.read().decode("utf-8").splitlines()
        reader = csv.DictReader(content)
        for row in reader:
            email = row.get("email")
            password = row.get("password")
            if not email or not password:
                continue
            if db.query(UserDB).filter(UserDB.email == email).first():
                continue
            hashed_password = get_password_hash(password)
            db.add(UserDB(email=email, password=hashed_password))
        db.commit()
        return {"msg": "Users uploaded successfully"}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(exc)}")


@app.delete("/delete-user/{email}", response_model=dict)
def delete_user(email: str, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    is_admin_user(current_user)

    user = db.query(UserDB).filter(UserDB.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"msg": f"User {email} deleted successfully"}


@app.post("/datasets", response_model=dict)
def create_dataset(
    dataset: DatasetCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dataset_name = normalize_name(dataset.dataset_name)
    if not dataset_name:
        raise HTTPException(status_code=400, detail="Dataset name cannot be empty")

    existing = db.query(DatasetDB).filter(
        DatasetDB.dataset_name == dataset_name,
        DatasetDB.owner_email == current_user["email"]
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Dataset already exists")

    doc = DatasetDB(
        dataset_name=dataset_name,
        owner_email=current_user["email"],
        created_at=datetime.utcnow()
    )
    db.add(doc)
    db.commit()
    return {
        "dataset_name": dataset_name,
        "created_at": doc.created_at
    }


@app.get("/datasets", response_model=dict)
def list_datasets(
    page: int = 1,
    per_page: int = 10,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    page = max(1, page)
    per_page = min(50, max(1, per_page))

    total = db.query(func.count(DatasetDB.id)).filter(
        DatasetDB.owner_email == current_user["email"]
    ).scalar() or 0

    datasets = (
        db.query(DatasetDB)
        .filter(DatasetDB.owner_email == current_user["email"])
        .order_by(DatasetDB.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    dataset_ids = [dataset.id for dataset in datasets]
    table_counts: Dict[int, int] = {}
    row_counts: Dict[int, int] = {}

    if dataset_ids:
        table_counts = dict(
            db.query(TableDB.dataset_id, func.count(TableDB.id))
            .filter(TableDB.dataset_id.in_(dataset_ids))
            .group_by(TableDB.dataset_id)
            .all()
        )
        row_counts = dict(
            db.query(TableDB.dataset_id, func.count(RowDB.id))
            .join(RowDB, RowDB.table_id == TableDB.id)
            .filter(TableDB.dataset_id.in_(dataset_ids))
            .group_by(TableDB.dataset_id)
            .all()
        )

    data = []
    for item in datasets:
        data.append({
            "datasetName": item.dataset_name,
            "totalTables": table_counts.get(item.id, 0),
            "totalRows": row_counts.get(item.id, 0),
            "createdAt": item.created_at
        })

    pagination = build_pagination(page, per_page, total)
    return {"data": data, "pagination": pagination}


@app.delete("/datasets/{dataset_name}", response_model=dict)
def delete_dataset(
    dataset_name: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dataset = get_dataset_or_404(dataset_name, current_user["email"], db)
    db.delete(dataset)
    db.commit()
    return {"msg": f"Dataset '{dataset_name}' deleted"}


@app.get("/datasets/{dataset_name}/tables", response_model=dict)
def list_tables(
    dataset_name: str,
    page: int = 1,
    per_page: int = 10,
    next_cursor: Optional[str] = Query(None),
    prev_cursor: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dataset = get_dataset_or_404(dataset_name, current_user["email"], db)
    page = resolve_page(page, next_cursor, prev_cursor)
    per_page = min(25, max(1, per_page))

    total = db.query(func.count(TableDB.id)).filter(
        TableDB.dataset_id == dataset.id
    ).scalar() or 0

    tables = (
        db.query(TableDB)
        .filter(TableDB.dataset_id == dataset.id)
        .order_by(TableDB.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = []
    for item in tables:
        data.append({
            "tableName": item.table_name,
            "totalRows": item.total_rows or 0,
            "createdAt": item.created_at,
            "status": item.status or "READY",
            "classificationStatus": item.classification_status or "UNSET"
        })

    pagination = build_pagination(page, per_page, total)
    return {"data": data, "pagination": pagination}


@app.delete("/datasets/{dataset_name}/tables/{table_name}", response_model=dict)
def delete_table(
    dataset_name: str,
    table_name: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    db.delete(table)
    db.commit()
    return {"msg": f"Table '{table_name}' deleted"}


@app.post("/datasets/{dataset_name}/tables/upload", response_model=dict)
def upload_table(
    dataset_name: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    table_name: Optional[str] = Form(None),
    column_classification: Optional[str] = Form(None),
    auto_detect: Optional[bool] = Form(False),
    llm_provider: Optional[str] = Form(None),
    llm_model: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dataset = get_dataset_or_404(dataset_name, current_user["email"], db)
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    resolved_table_name = normalize_name(table_name) or os.path.splitext(file.filename)[0]
    if not resolved_table_name:
        raise HTTPException(status_code=400, detail="Unable to determine table name")

    try:
        raw_content = file.file.read().decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded") from exc

    reader = csv.reader(StringIO(raw_content))
    try:
        header = next(reader)
    except StopIteration as exc:
        raise HTTPException(status_code=400, detail="CSV file is empty") from exc

    header = [normalize_name(col) or f"Column {idx+1}" for idx, col in enumerate(header)]
    classification = parse_column_classification(column_classification, len(header))
    has_classification = bool(classification.get("NE") or classification.get("LIT"))
    classification_status = "MANUAL" if has_classification else ("AUTO_PENDING" if auto_detect else "UNSET")
    moose_config = None
    user_settings = get_user_llm_settings(db, current_user["email"])
    if auto_detect and not has_classification:
        moose_config = load_moose_config(llm_provider, llm_model, user_settings)
        if moose_config["missing"]:
            missing = ", ".join(moose_config["missing"])
            raise HTTPException(status_code=500, detail=f"Missing Moose configuration: {missing}")
    score_column = detect_score_column(header)

    table = (
        db.query(TableDB)
        .filter(TableDB.dataset_id == dataset.id, TableDB.table_name == resolved_table_name)
        .first()
    )
    if not table:
        table = TableDB(
            dataset_id=dataset.id,
            table_name=resolved_table_name,
            header=header,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(table)
        db.commit()
        db.refresh(table)
    else:
        db.query(RowDB).filter(RowDB.table_id == table.id).delete(synchronize_session=False)
        db.commit()

    column_counts = {
        idx: 0 for idx in set(
            list(classification.get("NE", {}).keys()) + list(classification.get("LIT", {}).keys())
        )
    }
    row_counter = 0
    batch_size = 5000
    rows_to_insert = []
    now = datetime.utcnow()

    for row in reader:
        if not row or not any(normalize_cell(cell) for cell in row):
            continue
        padded = row + [""] * (len(header) - len(row))
        trimmed = [normalize_cell(cell) for cell in padded[:len(header)]]
        row_types = []
        row_score = (
            parse_score_value(trimmed[score_column])
            if score_column is not None and score_column < len(trimmed)
            else None
        )
        search_blob = " ".join(value for value in trimmed if value).lower()
        for idx in column_counts:
            if idx < len(trimmed) and normalize_cell(trimmed[idx]):
                column_counts[idx] += 1
        rows_to_insert.append({
            "table_id": table.id,
            "id_row": row_counter,
            "data": trimmed,
            "row_score": row_score,
            "row_types": row_types,
            "search_blob": search_blob,
            "created_at": now,
            "updated_at": now
        })
        row_counter += 1

        if len(rows_to_insert) >= batch_size:
            db.bulk_insert_mappings(RowDB, rows_to_insert)
            db.commit()
            rows_to_insert = []

    if rows_to_insert:
        db.bulk_insert_mappings(RowDB, rows_to_insert)
        db.commit()

    column_types = build_column_type_summary_from_counts(header, classification, row_counter, column_counts)

    table.header = header
    table.total_rows = row_counter
    table.status = "READY"
    table.classified_columns = classification
    table.column_types = column_types
    table.classification_status = classification_status
    table.score_column = score_column
    table.score_column_name = header[score_column] if score_column is not None else None
    table.updated_at = datetime.utcnow()
    db.commit()

    if moose_config:
        sampled_rows = build_sampled_rows(db, table.id, header, moose_config["sample_size"])
        job_id = submit_moose_tabular_job(
            moose_config,
            sampled_rows,
            dataset_name,
            resolved_table_name
        )
        table.moose_job_id = job_id
        table.updated_at = datetime.utcnow()
        db.commit()
        launch_moose_job(table.id, job_id, moose_config)

    return {
        "dataset_name": dataset_name,
        "table_name": resolved_table_name,
        "total_rows": row_counter,
        "status": "READY",
        "classification_status": classification_status
    }


@app.get("/datasets/{dataset_name}/tables/{table_name}", response_model=dict)
def get_table_data(
    dataset_name: str,
    table_name: str,
    page: int = 1,
    per_page: int = 10,
    search: Optional[str] = None,
    search_columns: Optional[List[int]] = Query(None),
    include_types: Optional[List[str]] = Query(None),
    exclude_types: Optional[List[str]] = Query(None),
    sort_by: Optional[str] = None,
    sort_direction: Optional[str] = None,
    next_cursor: Optional[str] = Query(None),
    prev_cursor: Optional[str] = Query(None),
    reconciliation_provider: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    resolved_page = resolve_page(page, next_cursor, prev_cursor)
    per_page = min(100, max(1, per_page))

    excluded_types: Set[str] = set()
    for entry in (table.column_types or {}).values():
        for type_entry in entry.get("types", []) if isinstance(entry, dict) else []:
            type_id = type_entry.get("id")
            if type_id:
                excluded_types.add(type_id)

    query = db.query(RowDB).filter(RowDB.table_id == table.id)

    if search:
        target_columns = search_columns if search_columns else []
        if target_columns:
            valid_columns = [
                int(idx)
                for idx in target_columns
                if isinstance(idx, int) and 0 <= idx < len(table.header or [])
            ]
            if valid_columns:
                search_filters = []
                for idx in valid_columns:
                    search_filters.append(RowDB.data[idx].astext.ilike(f"%{search}%"))
                query = query.filter(or_(*search_filters))
            else:
                search_query = func.plainto_tsquery(cast(literal("simple"), type_=REGCONFIG), search)
                query = query.filter(
                    func.to_tsvector(cast(literal("simple"), type_=REGCONFIG), RowDB.search_blob).op("@@")(search_query)
                )
        else:
            search_query = func.plainto_tsquery(cast(literal("simple"), type_=REGCONFIG), search)
            query = query.filter(
                func.to_tsvector(cast(literal("simple"), type_=REGCONFIG), RowDB.search_blob).op("@@")(search_query)
            )

    if include_types:
        include_filtered = [t for t in include_types if t not in excluded_types]
        if include_filtered:
            query = query.filter(RowDB.row_types.overlap(include_filtered))
        else:
            query = query.filter(literal(False))
    if exclude_types:
        exclude_filtered = [t for t in exclude_types if t not in excluded_types]
        if exclude_filtered:
            query = query.filter(~RowDB.row_types.overlap(exclude_filtered))

    total_matches = query.count()
    total_rows = table.total_rows or (
        db.query(func.count(RowDB.id)).filter(RowDB.table_id == table.id).scalar() or 0
    )
    row_type_summary = build_row_type_summary(db, table.id, total_rows, excluded_types)

    resolved_sort_by = (sort_by or "").lower()
    resolved_direction = (sort_direction or "").lower()
    sort_desc = resolved_direction == "desc"

    if resolved_sort_by == "score":
        sort_column = RowDB.row_score.desc() if sort_desc else RowDB.row_score.asc()
        query = query.order_by(nulls_last(sort_column), RowDB.id_row.asc())
    elif resolved_sort_by == "id":
        sort_column = RowDB.id_row.desc() if sort_desc else RowDB.id_row.asc()
        query = query.order_by(sort_column)
    else:
        query = query.order_by(RowDB.id_row.asc())

    rows = (
        query.offset((resolved_page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    pagination = build_pagination(resolved_page, per_page, total_matches)
    serialized_rows = [serialize_row(row) for row in rows]
    row_ids = [row.id_row for row in rows]
    reconciliation_map: Dict[int, Dict[int, Any]] = {}
    provider_filter = normalize_optional_value(reconciliation_provider)
    if provider_filter:
        provider_filter = normalize_reconciliation_provider(provider_filter)
    if row_ids:
        recon_query = (
            db.query(ReconciliationCellDB)
            .filter(
                ReconciliationCellDB.table_id == table.id,
                ReconciliationCellDB.row_id.in_(row_ids)
            )
        )
        if provider_filter:
            recon_query = recon_query.filter(ReconciliationCellDB.provider == provider_filter)
        recon_query = recon_query.order_by(ReconciliationCellDB.updated_at.desc().nulls_last())
        recon_cells = recon_query.all()
        for cell in recon_cells:
            row_entry = reconciliation_map.setdefault(cell.row_id, {})
            if cell.col_idx in row_entry:
                continue
            top_candidates = cell.candidate_ranking or []
            if isinstance(top_candidates, list):
                top_candidates = top_candidates[:5]
            row_entry[cell.col_idx] = {
                "provider": cell.provider,
                "job_id": cell.external_job_id,
                "cell_id": cell.cell_id,
                "mention": cell.mention,
                "final": cell.final or {},
                "candidate_ranking": top_candidates,
                "explanation": cell.explanation,
                "updated_at": cell.updated_at.isoformat() if cell.updated_at else None
            }

    response_payload = {
        "data": {
            "dataset_name": dataset_name,
            "table_name": table_name,
            "header": table.header or [],
            "rows": serialized_rows,
            "classified_columns": table.classified_columns or {},
            "column_types": table.column_types or {},
            "classification_status": table.classification_status or "UNSET",
            "auto_identify_job_id": table.moose_job_id,
            "dpv_annotations": table.dpv_annotations or {},
            "dpv_status": table.dpv_status or "UNSET",
            "dpv_job_id": table.dpv_job_id,
            "recon_column_types_status": table.recon_column_types_status or "UNSET",
            "recon_column_types_job_id": table.recon_column_types_job_id,
            "recon_column_types_updated_at": (
                table.recon_column_types_updated_at.isoformat()
                if table.recon_column_types_updated_at
                else None
            ),
            "score_column": table.score_column,
            "score_column_name": table.score_column_name,
            "status": table.status or "READY",
            "total_rows": total_rows or total_matches,
            "total_matches": total_matches,
            "row_type_summary": row_type_summary,
            "reconciliation": {
                "provider": provider_filter or "all",
                "cells": reconciliation_map
            }
        },
        "pagination": pagination
    }
    return response_payload


@app.get("/datasets/{dataset_name}/tables/{table_name}/status", response_model=dict)
def get_table_status_endpoint(
    dataset_name: str,
    table_name: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    total_rows = table.total_rows or 0
    return {
        "status": table.status or "READY",
        "phase": "READY",
        "classification_status": table.classification_status or "UNSET",
        "auto_identify_job_id": table.moose_job_id,
        "dpv_status": table.dpv_status or "UNSET",
        "dpv_job_id": table.dpv_job_id,
        "completed_rows": total_rows,
        "total_rows": total_rows,
        "completion_percentage": 100
    }


@app.get("/datasets/{dataset_name}/tables/{table_name}/export")
def export_table_csv(
    dataset_name: str,
    table_name: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    cursor = (
        db.query(RowDB)
        .filter(RowDB.table_id == table.id)
        .order_by(RowDB.id_row.asc())
        .all()
    )

    output = StringIO()
    writer = csv.writer(output)

    header_row = table.header or []
    writer.writerow(header_row)

    for row in cursor:
        writer.writerow(row.data or [])

    output.seek(0)
    filename = f"{dataset_name}_{table_name}_export.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.put("/datasets/{dataset_name}/tables/{table_name}/columns/classification", response_model=dict)
def update_column_classification(
    dataset_name: str,
    table_name: str,
    payload: ColumnClassificationUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    header = table.header or []
    if not header:
        raise HTTPException(status_code=400, detail="Table header is empty")

    classification = parse_column_classification(payload.classification, len(header))
    has_classification = bool(classification.get("NE") or classification.get("LIT"))
    classification_status = "MANUAL" if has_classification else "UNSET"
    score_column = detect_score_column(header)

    column_counts = {
        idx: 0 for idx in set(
            list(classification.get("NE", {}).keys()) + list(classification.get("LIT", {}).keys())
        )
    }
    total_rows = 0
    updates = []
    batch_size = 1000
    now = datetime.utcnow()

    query = (
        db.query(RowDB)
        .filter(RowDB.table_id == table.id)
        .order_by(RowDB.id_row.asc())
    )

    for row in query.yield_per(batch_size):
        data = row.data or []
        total_rows += 1
        for idx in column_counts:
            if idx < len(data) and normalize_cell(data[idx]):
                column_counts[idx] += 1
        row_score = (
            parse_score_value(data[score_column])
            if score_column is not None and score_column < len(data)
            else None
        )
        updates.append({
            "id": row.id,
            "row_score": row_score,
            "updated_at": now
        })

        if len(updates) >= batch_size:
            db.bulk_update_mappings(RowDB, updates)
            db.commit()
            updates = []

    if updates:
        db.bulk_update_mappings(RowDB, updates)
        db.commit()

    column_types = build_column_type_summary_from_counts(header, classification, total_rows, column_counts)

    table.classified_columns = classification
    table.column_types = column_types
    table.classification_status = classification_status
    table.score_column = score_column
    table.score_column_name = header[score_column] if score_column is not None else None
    table.updated_at = datetime.utcnow()
    db.commit()

    return {
        "classification_status": classification_status,
        "column_types": column_types,
        "score_column": score_column,
        "score_column_name": header[score_column] if score_column is not None else None
    }


@app.post("/datasets/{dataset_name}/tables/{table_name}/columns/identify", response_model=dict)
def identify_columns(
    dataset_name: str,
    table_name: str,
    background_tasks: BackgroundTasks,
    llm_provider: Optional[str] = Query(None),
    llm_model: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    header = table.header or []
    if not header:
        raise HTTPException(status_code=400, detail="Table header is empty.")

    user_settings = get_user_llm_settings(db, current_user["email"])
    config = load_moose_config(llm_provider, llm_model, user_settings)
    if config["missing"]:
        missing = ", ".join(config["missing"])
        raise HTTPException(status_code=500, detail=f"Missing Moose configuration: {missing}")

    sampled_rows = build_sampled_rows(db, table.id, header, config["sample_size"])
    job_id = submit_moose_tabular_job(config, sampled_rows, dataset_name, table_name)

    table.classification_status = "AUTO_PENDING"
    table.moose_job_id = job_id
    table.updated_at = datetime.utcnow()
    db.commit()

    launch_moose_job(table.id, job_id, config)

    return {
        "status": "QUEUED",
        "job_id": job_id,
        "detail": "Automatic column identification queued.",
        "llm_provider": config["llm_provider"],
        "llm_model": config["llm_model"]
    }


@app.post("/datasets/{dataset_name}/tables/{table_name}/columns/dpv/annotate", response_model=dict)
def annotate_dpv_columns(
    dataset_name: str,
    table_name: str,
    llm_provider: Optional[str] = Query(None),
    llm_model: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    header = table.header or []
    if not header:
        raise HTTPException(status_code=400, detail="Table header is empty.")

    user_settings = get_user_llm_settings(db, current_user["email"])
    config = load_moose_config(llm_provider, llm_model, user_settings)
    if config["missing"]:
        missing = ", ".join(config["missing"])
        raise HTTPException(status_code=500, detail=f"Missing Moose configuration: {missing}")

    sampled_rows = build_sampled_rows(db, table.id, header, config["sample_size"])
    job_id = submit_moose_tabular_job(
        config,
        sampled_rows,
        dataset_name,
        table_name,
        schema_override="dpv"
    )

    table.dpv_status = "DPV_PENDING"
    table.dpv_job_id = job_id
    table.updated_at = datetime.utcnow()
    db.commit()

    launch_dpv_job(table.id, job_id, config)

    return {
        "status": "QUEUED",
        "job_id": job_id,
        "detail": "DPV annotation queued.",
        "llm_provider": config["llm_provider"],
        "llm_model": config["llm_model"]
    }


@app.get("/datasets/{dataset_name}/tables/{table_name}/columns/identify/status", response_model=dict)
def get_identify_status(
    dataset_name: str,
    table_name: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    job_id = table.moose_job_id
    if not job_id:
        return {
            "status": table.classification_status or "UNSET",
            "job_id": None
        }

    config = load_moose_status_config()
    if config["missing"]:
        missing = ", ".join(config["missing"])
        raise HTTPException(status_code=500, detail=f"Missing Moose configuration: {missing}")

    try:
        payload = get_moose_job_status(config, job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unable to fetch Moose job status: {exc}")

    status = (payload.get("status") or "").lower()
    if status == "completed":
        classification = extract_moose_classification(table.header or [], payload)
        if classification.get("NE") or classification.get("LIT"):
            apply_column_classification(db, table, classification, "AUTO")
            table.moose_job_id = None
            table.updated_at = datetime.utcnow()
            db.commit()
            return {
                "status": "AUTO",
                "job_id": job_id,
                "job_status": "completed"
            }
        table.classification_status = "AUTO_FAILED"
        table.moose_job_id = None
        table.updated_at = datetime.utcnow()
        db.commit()
        return {
            "status": "AUTO_FAILED",
            "job_id": job_id,
            "job_status": "completed"
        }
    if status in {"failed", "error"}:
        table.classification_status = "AUTO_FAILED"
        table.moose_job_id = None
        table.updated_at = datetime.utcnow()
        db.commit()
        return {
            "status": "AUTO_FAILED",
            "job_id": job_id,
            "job_status": status
        }

    return {
        "status": table.classification_status or "AUTO_PENDING",
        "job_id": job_id,
        "job_status": status or "unknown"
    }


@app.get("/datasets/{dataset_name}/tables/{table_name}/columns/dpv/status", response_model=dict)
def get_dpv_status(
    dataset_name: str,
    table_name: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    job_id = table.dpv_job_id
    if not job_id:
        return {
            "status": table.dpv_status or "UNSET",
            "job_id": None
        }

    config = load_moose_status_config()
    if config["missing"]:
        missing = ", ".join(config["missing"])
        raise HTTPException(status_code=500, detail=f"Missing Moose configuration: {missing}")

    try:
        payload = get_moose_job_status(config, job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unable to fetch Moose job status: {exc}")

    status = (payload.get("status") or "").lower()
    if status == "completed":
        annotations = extract_moose_dpv_annotations(table.header or [], payload)
        if annotations:
            apply_dpv_annotations(db, table, annotations, "DPV")
            table.dpv_job_id = None
            table.updated_at = datetime.utcnow()
            db.commit()
            return {
                "status": "DPV",
                "job_id": job_id,
                "job_status": "completed"
            }
        table.dpv_status = "DPV_FAILED"
        table.dpv_job_id = None
        table.updated_at = datetime.utcnow()
        db.commit()
        return {
            "status": "DPV_FAILED",
            "job_id": job_id,
            "job_status": "completed"
        }
    if status in {"failed", "error"}:
        table.dpv_status = "DPV_FAILED"
        table.dpv_job_id = None
        table.updated_at = datetime.utcnow()
        db.commit()
        return {
            "status": "DPV_FAILED",
            "job_id": job_id,
            "job_status": status
        }

    return {
        "status": table.dpv_status or "DPV_PENDING",
        "job_id": job_id,
        "job_status": status or "unknown"
    }


@app.post("/datasets/{dataset_name}/tables/{table_name}/reconcile", response_model=dict)
def reconcile_table(
    dataset_name: str,
    table_name: str,
    payload: ReconcileRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    provider = normalize_reconciliation_provider(payload.provider)

    header = table.header or []
    if not header:
        raise HTTPException(status_code=400, detail="Table has no columns to reconcile.")

    scope = (payload.scope or "page").lower()
    total_rows = table.total_rows or (
        db.query(func.count(RowDB.id)).filter(RowDB.table_id == table.id).scalar() or 0
    )

    selected_columns = list(range(len(header))) if payload.columns is None else payload.columns
    parsed_columns: Set[int] = set()
    try:
        for idx in selected_columns:
            parsed_columns.add(int(idx))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Selected columns must be integers.")
    selected_columns = sorted(parsed_columns)
    if not selected_columns:
        raise HTTPException(status_code=400, detail="No columns selected for reconciliation.")
    if any(idx < 0 or idx >= len(header) for idx in selected_columns):
        raise HTTPException(status_code=400, detail="Selected columns are out of range.")

    selected_rows: Optional[List[int]] = None
    cell_whitelist: Optional[Set[tuple]] = None
    selected_cells_payload: List[Dict[str, int]] = []

    if scope == "cell":
        if not payload.cells:
            raise HTTPException(status_code=400, detail="No cells selected for reconciliation.")
        cell_whitelist = set()
        selected_rows_set = set()
        selected_cols_set = set()
        for cell in payload.cells:
            try:
                row_idx = int(cell.row)
                col_idx = int(cell.col)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Selected cells must use integer row/column indices.")
            if row_idx < 0 or row_idx >= total_rows:
                raise HTTPException(status_code=400, detail="Selected rows are out of range.")
            if col_idx < 0 or col_idx >= len(header):
                raise HTTPException(status_code=400, detail="Selected columns are out of range.")
            cell_whitelist.add((row_idx, col_idx))
            selected_rows_set.add(row_idx)
            selected_cols_set.add(col_idx)
            selected_cells_payload.append({"row": row_idx, "col": col_idx})
        selected_rows = sorted(selected_rows_set)
        selected_columns = sorted(selected_cols_set)
        if not selected_columns:
            raise HTTPException(status_code=400, detail="No columns selected for reconciliation.")
    elif scope in {"rows", "page"}:
        if not payload.rows:
            raise HTTPException(status_code=400, detail="No rows selected for reconciliation.")
        parsed_rows: Set[int] = set()
        try:
            for idx in payload.rows:
                parsed_rows.add(int(idx))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Selected rows must be integers.")
        selected_rows = sorted(parsed_rows)
        if any(idx < 0 or idx >= total_rows for idx in selected_rows):
            raise HTTPException(status_code=400, detail="Selected rows are out of range.")
    elif scope == "table":
        selected_rows = None
    else:
        raise HTTPException(status_code=400, detail="Invalid reconciliation scope.")

    rows_query = (
        db.query(RowDB)
        .filter(RowDB.table_id == table.id)
        .order_by(RowDB.id_row.asc())
    )
    if selected_rows is not None:
        rows_query = rows_query.filter(RowDB.id_row.in_(selected_rows))
    rows = rows_query.all()
    if selected_rows is not None and len(rows) != len(selected_rows):
        raise HTTPException(status_code=400, detail="Some selected rows were not found.")
    if not rows:
        raise HTTPException(status_code=400, detail="No rows available for reconciliation.")

    inline_table = build_reconciliation_inline_table(header, rows, selected_columns, cell_whitelist)
    input_payload = {
        "mode": "inline",
        "format": "application/json",
        "table": inline_table
    }
    row_map = [row.id_row for row in rows]

    classified = table.classified_columns or {}
    ne_entries = classified.get("NE", {}) if isinstance(classified, dict) else {}
    ne_indices: Set[int] = set()
    if isinstance(ne_entries, dict):
        for key in ne_entries.keys():
            try:
                ne_indices.add(int(key))
            except (TypeError, ValueError):
                continue
    ne_selected_columns = [idx for idx in selected_columns if idx in ne_indices]
    if not ne_selected_columns:
        raise HTTPException(
            status_code=400,
            detail="No NE columns selected for reconciliation. Classify columns first."
        )
    link_columns = [header[idx] for idx in ne_selected_columns]
    job_payload: Dict[str, Any]
    job_response: Dict[str, Any]

    if provider == "lion_linker":
        config = load_lion_config(db, current_user["email"])
        if config["missing"]:
            missing = ", ".join(config["missing"])
            raise HTTPException(status_code=500, detail=f"Missing Lion Linker configuration: {missing}")
        retriever_config = load_lion_retriever_config(db, current_user["email"])
        if retriever_config["missing"]:
            missing = ", ".join(retriever_config["missing"])
            raise HTTPException(status_code=500, detail=f"Missing Lamapi configuration: {missing}")
        model_provider = retriever_config.get("model_api_provider")
        model_name = retriever_config.get("model_name")
        if not model_provider or not model_name:
            raise HTTPException(
                status_code=400,
                detail="Lion Linker model provider and model name are required. Set them in the profile or env."
            )

        lion_config = {
            "model_api_provider": model_provider,
            "model_name": model_name
        }

        retriever_payload = {
            "endpoint": retriever_config.get("endpoint"),
            "token": retriever_config.get("token"),
            "kg": retriever_config.get("kg"),
            "num_candidates": retriever_config.get("num_candidates")
        }

        job_payload = {
            "input": input_payload,
            "link_columns": link_columns,
            "top_k": payload.top_k,
            "execution": "async",
            "config": {
                "lion": lion_config,
                "retriever": retriever_payload
            }
        }

        try:
            job_response = create_lion_job(config, job_payload)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Unable to create Lion Linker job: {exc}")
    else:
        config = load_crocodile_config(db, current_user["email"])
        if config["missing"]:
            missing = ", ".join(config["missing"])
            raise HTTPException(status_code=500, detail=f"Missing Crocodile configuration: {missing}")
        job_payload = {
            "mode": "inline",
            "header": inline_table.get("header") or [],
            "rows": inline_table.get("rows") or [],
            "link_columns": link_columns,
            "config": {}
        }
        if payload.top_k is not None:
            job_payload["top_k"] = payload.top_k
        try:
            job_response = create_crocodile_job(config, job_payload)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Unable to create Crocodile job: {exc}")

    external_job_id = job_response.get("job_id")
    if not external_job_id:
        raise HTTPException(status_code=502, detail=f"{provider} did not return a job_id.")
    status = (job_response.get("status") or "queued").lower()

    job = ReconciliationJobDB(
        table_id=table.id,
        provider=provider,
        external_job_id=external_job_id,
        status=status,
        scope=scope,
        selected_rows=selected_rows or [],
        selected_columns=selected_columns or [],
        selected_cells=selected_cells_payload,
        row_map=row_map,
        col_map=selected_columns,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    launch_reconciliation_job(job.id)

    return {
        "job_id": job.id,
        "external_job_id": external_job_id,
        "status": status,
        "detail": "Reconciliation job queued."
    }


@app.get("/datasets/{dataset_name}/tables/{table_name}/reconcile/{job_id}/status", response_model=dict)
def get_reconciliation_status(
    dataset_name: str,
    table_name: str,
    job_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    job = (
        db.query(ReconciliationJobDB)
        .filter(ReconciliationJobDB.id == job_id, ReconciliationJobDB.table_id == table.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Reconciliation job not found.")

    success_statuses = {"completed", "succeeded", "success", "done", "finished"}
    if job.status in success_statuses and not job.synced_at:
        launch_reconciliation_sync(job.id)

    return {
        "job_id": job.id,
        "external_job_id": job.external_job_id,
        "provider": job.provider,
        "status": job.status,
        "synced": bool(job.synced_at),
        "error": job.error
    }


def process_reconciliation_column_types_job(
    table_id: int,
    job_id: str,
    provider: Optional[str],
    sample_strategy: str,
    sample_size: int,
    max_types: int
) -> None:
    db = SessionLocal()
    try:
        table = db.query(TableDB).filter(TableDB.id == table_id).first()
        if not table:
            return
        if table.recon_column_types_job_id != job_id:
            return

        table.recon_column_types_status = "RUNNING"
        table.recon_column_types_error = None
        table.updated_at = datetime.utcnow()
        db.commit()

        result = build_reconciliation_column_type_ranking(
            db=db,
            table=table,
            provider=provider,
            max_types_per_column=max_types,
            sample_strategy=sample_strategy,
            sample_size=sample_size
        )
        table.recon_column_types_status = "READY"
        table.recon_column_types_result = result
        table.recon_column_types_error = None
        table.recon_column_types_updated_at = datetime.utcnow()
        table.recon_column_types_config = {
            "provider": provider or "all",
            "sample_strategy": sample_strategy,
            "sample_size": sample_size,
            "max_types": max_types,
            "job_id": job_id
        }
        table.updated_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        table = db.query(TableDB).filter(TableDB.id == table_id).first()
        if table:
            table.recon_column_types_status = "FAILED"
            table.recon_column_types_error = {"detail": str(exc)}
            table.updated_at = datetime.utcnow()
            db.commit()
        logger.exception("Reconciliation column type job %s failed: %s", job_id, exc)
    finally:
        db.close()


def launch_reconciliation_column_types_job(
    table_id: int,
    job_id: str,
    provider: Optional[str],
    sample_strategy: str,
    sample_size: int,
    max_types: int
) -> None:
    worker = threading.Thread(
        target=process_reconciliation_column_types_job,
        args=(table_id, job_id, provider, sample_strategy, sample_size, max_types),
        daemon=True
    )
    worker.start()


@app.post("/datasets/{dataset_name}/tables/{table_name}/reconcile/column-types", response_model=dict)
def trigger_reconciliation_column_types(
    dataset_name: str,
    table_name: str,
    payload: ReconciliationColumnTypeComputeRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    provider_filter = normalize_optional_value(payload.provider)
    if provider_filter:
        provider_filter = normalize_reconciliation_provider(provider_filter)
    sample_strategy = (payload.sample_strategy or "auto").lower()
    if sample_strategy not in RECON_COLUMN_TYPES_STRATEGIES:
        raise HTTPException(status_code=400, detail=f"Unsupported sample strategy '{sample_strategy}'.")
    sample_size = payload.sample_size or RECON_COLUMN_TYPES_SAMPLE_DEFAULT
    sample_size = max(1, min(int(sample_size), RECON_COLUMN_TYPES_SAMPLE_MAX))
    max_types = payload.max_types or RECON_COLUMN_TYPES_MAX_TYPES_DEFAULT
    max_types = max(1, min(int(max_types), 25))

    job_id = uuid.uuid4().hex
    table.recon_column_types_status = "PENDING"
    table.recon_column_types_job_id = job_id
    table.recon_column_types_error = None
    table.recon_column_types_config = {
        "provider": provider_filter or "all",
        "sample_strategy": sample_strategy,
        "sample_size": sample_size,
        "max_types": max_types,
        "requested_at": datetime.utcnow().isoformat(),
        "job_id": job_id
    }
    table.updated_at = datetime.utcnow()
    db.commit()

    launch_reconciliation_column_types_job(
        table_id=table.id,
        job_id=job_id,
        provider=provider_filter,
        sample_strategy=sample_strategy,
        sample_size=sample_size,
        max_types=max_types
    )
    return {
        "status": "PENDING",
        "job_id": job_id,
        "config": table.recon_column_types_config,
        "detail": "NE column type ranking job started."
    }


@app.get("/datasets/{dataset_name}/tables/{table_name}/reconcile/column-types", response_model=dict)
def get_reconciliation_column_types(
    dataset_name: str,
    table_name: str,
    provider: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    provider_filter = normalize_optional_value(provider)
    if provider_filter:
        provider_filter = normalize_reconciliation_provider(provider_filter)
    result = table.recon_column_types_result or {}
    config = table.recon_column_types_config or {}
    result_provider = normalize_optional_value(result.get("provider")) if isinstance(result, dict) else None
    stale = bool(
        provider_filter and
        result_provider and
        result_provider not in {provider_filter, "all"}
    )
    return {
        "status": table.recon_column_types_status or "UNSET",
        "job_id": table.recon_column_types_job_id,
        "updated_at": table.recon_column_types_updated_at.isoformat() if table.recon_column_types_updated_at else None,
        "config": config,
        "stale": stale,
        "result": result if isinstance(result, dict) else {},
        "error": table.recon_column_types_error
    }


@app.get("/datasets/{dataset_name}/tables/{table_name}/reconcile/candidates", response_model=dict)
def get_reconciliation_candidates(
    dataset_name: str,
    table_name: str,
    row: int = Query(...),
    col: int = Query(...),
    provider: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    provider_filter = normalize_optional_value(provider)
    if provider_filter:
        provider_filter = normalize_reconciliation_provider(provider_filter)
    query = (
        db.query(ReconciliationCellDB)
        .filter(
            ReconciliationCellDB.table_id == table.id,
            ReconciliationCellDB.row_id == row,
            ReconciliationCellDB.col_idx == col
        )
    )
    if provider_filter:
        query = query.filter(ReconciliationCellDB.provider == provider_filter)
    cell = query.order_by(ReconciliationCellDB.updated_at.desc()).first()
    if not cell:
        raise HTTPException(status_code=404, detail="No reconciliation results found for this cell.")
    job = None
    if cell.job_id:
        job = db.query(ReconciliationJobDB).filter(ReconciliationJobDB.id == cell.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Reconciliation job not found for this cell.")
    payload = {
        "row": row,
        "col": col,
        "cell_id": cell.cell_id,
        "mention": cell.mention,
        "candidate_ranking": (cell.candidate_ranking or [])[:5],
        "explanation": cell.explanation,
        "provider": cell.provider
    }

    return {
        "job_id": job.id,
        "external_job_id": job.external_job_id,
        "provider": cell.provider,
        "row": row,
        "col": col,
        "payload": payload
    }


@app.put("/datasets/{dataset_name}/tables/{table_name}/reconcile/cell", response_model=dict)
def update_reconciliation_cell(
    dataset_name: str,
    table_name: str,
    payload: ReconciliationCellUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    provider = normalize_reconciliation_provider(payload.provider)
    row_idx = int(payload.row)
    col_idx = int(payload.col)
    if row_idx < 0 or col_idx < 0:
        raise HTTPException(status_code=400, detail="Row and column must be non-negative.")
    if col_idx >= len(table.header or []):
        raise HTTPException(status_code=400, detail="Column index out of range.")
    total_rows = table.total_rows or (
        db.query(func.count(RowDB.id)).filter(RowDB.table_id == table.id).scalar() or 0
    )
    if row_idx >= total_rows:
        raise HTTPException(status_code=400, detail="Row index out of range.")

    cell = (
        db.query(ReconciliationCellDB)
        .filter(
            ReconciliationCellDB.table_id == table.id,
            ReconciliationCellDB.row_id == row_idx,
            ReconciliationCellDB.col_idx == col_idx,
            ReconciliationCellDB.provider == provider
        )
        .first()
    )
    if not cell:
        cell = ReconciliationCellDB(
            table_id=table.id,
            row_id=row_idx,
            col_idx=col_idx,
            provider=provider
        )
        db.add(cell)

    cell.final = payload.final or {}
    cell.updated_at = datetime.utcnow()
    mark_reconciliation_column_types_stale(db, table.id)
    db.commit()

    return {
        "row": row_idx,
        "col": col_idx,
        "provider": provider,
        "final": cell.final
    }
