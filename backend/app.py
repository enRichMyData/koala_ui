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
    select,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY, REGCONFIG
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, Session
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
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    reconciliation_score = Column(Float, nullable=True)
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
    top_k = Column(Integer, nullable=True)
    row_map = Column(JSONB, default=list)
    col_map = Column(JSONB, default=list)
    synced_at = Column(DateTime, nullable=True)
    progress = Column(JSONB, default=dict)
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
    score = Column(Float, nullable=True)
    candidate_ranking = Column(JSONB, default=list)
    explanation = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    table = relationship("TableDB", back_populates="reconciliation_cells")
    job = relationship("ReconciliationJobDB")

    __table_args__ = (
        UniqueConstraint("table_id", "row_id", "col_idx", "provider", name="uq_recon_cell"),
    )


Index("ix_rows_table_score", RowDB.table_id, RowDB.row_score)
Index("ix_rows_table_reconciliation_score", RowDB.table_id, RowDB.reconciliation_score)
Index("ix_rows_types_gin", RowDB.row_types, postgresql_using="gin")
Index(
    "ix_rows_search_tsv",
    func.to_tsvector(cast(literal("simple"), type_=REGCONFIG), RowDB.search_blob),
    postgresql_using="gin"
)
Index(
    "ix_reconciliation_cells_table_provider_row",
    ReconciliationCellDB.table_id,
    ReconciliationCellDB.provider,
    ReconciliationCellDB.row_id
)
Index(
    "ix_reconciliation_cells_table_provider_col_row",
    ReconciliationCellDB.table_id,
    ReconciliationCellDB.provider,
    ReconciliationCellDB.col_idx,
    ReconciliationCellDB.row_id
)
Index(
    "ix_reconciliation_cells_table_provider_col_score",
    ReconciliationCellDB.table_id,
    ReconciliationCellDB.provider,
    ReconciliationCellDB.col_idx,
    ReconciliationCellDB.score
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


class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str
    email: Optional[str] = None
    role: Optional[str] = None


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
    lamapi_endpoint: Optional[str] = None
    lamapi_token: Optional[str] = None
    lamapi_kg: Optional[str] = None
    lamapi_num_candidates: Optional[int] = None


class AdminUserCreate(BaseModel):
    email: str
    password: str
    role: Optional[str] = "user"


class AdminUserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None


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
        token_type: str = payload.get("type", "access")
        if token_type != "access":
            raise HTTPException(status_code=401, detail="Invalid token")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(UserDB).filter(UserDB.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {"email": user.email, "role": user.role}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def is_admin_user(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")


VALID_USER_ROLES = {"user", "admin"}


def normalize_user_role(value: Optional[str], default: str = "user") -> str:
    role = normalize_optional_value(value) or default
    role = role.lower()
    if role not in VALID_USER_ROLES:
        raise HTTPException(status_code=400, detail="Role must be one of: user, admin.")
    return role


def normalize_name(value: str) -> str:
    if not value:
        return ""
    return value.strip()


def normalize_cell(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_optional_value(value: Optional[Any]) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    if not cleaned:
        return None
    if cleaned.lower() in {"none", "null", "undefined"}:
        return None
    return cleaned


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
        if allowed_endpoints and endpoint not in allowed_endpoints:
            raise HTTPException(
                status_code=400,
                detail="LLM endpoint is not supported."
            )

MOOSE_DEFAULT_SCHEMA = "sti"
MOOSE_DEFAULT_SAMPLE_SIZE = 25
MOOSE_REQUEST_TIMEOUT_SECONDS = 30
MOOSE_POLL_INTERVAL_SECONDS = 2
MOOSE_POLL_TIMEOUT_SECONDS = 120
MOOSE_COMPLETED_STATUSES = {"completed", "complete", "success", "succeeded", "done", "finished"}
MOOSE_FAILED_STATUSES = {"failed", "error", "errored", "cancelled", "canceled"}

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

REFINED_DEFAULT_BASE_URL = "https://refined.zooverse.dev"
REFINED_REQUEST_TIMEOUT_SECONDS = 30
REFINED_POLL_INTERVAL_SECONDS = 2
REFINED_POLL_TIMEOUT_SECONDS = 300

WIKIDATA_DEFAULT_BASE_URL = "https://wikidata.reconci.link/en"
WIKIDATA_REQUEST_TIMEOUT_SECONDS = 30

DEFAULT_RECONCILIATION_PROVIDER = "lion_linker"

RECONCILIATION_PROVIDER_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "id": "lion_linker",
        "label": "Lion Linker",
        "description": "Entity linker powered by shared LLM + Lamapi retrieval.",
        "default_base_url": LION_DEFAULT_BASE_URL,
        "base_url_env": "LION_LINKER_BASE_URL",
        "api_key_env": "LION_LINKER_API_KEY",
        "requires_api_key": True,
        "uses_shared_llm": True,
        "supports_top_k": True,
        "supports_async_jobs": True,
        "extra_fields": [
            {
                "key": "lamapi_endpoint",
                "label": "Lamapi endpoint",
                "type": "text",
                "required": True,
                "placeholder": "https://lamapi.hel.sintef.cloud/lookup/entity-retrieval"
            },
            {
                "key": "lamapi_kg",
                "label": "Lamapi KG",
                "type": "text",
                "required": False,
                "placeholder": "wikidata"
            },
            {
                "key": "lamapi_num_candidates",
                "label": "Lamapi candidates",
                "type": "number",
                "required": False,
                "min": 1,
                "max": 100
            },
            {
                "key": "lamapi_token",
                "label": "Lamapi token",
                "type": "password",
                "required": True,
                "sensitive": True
            }
        ]
    },
    {
        "id": "crocodile",
        "label": "Crocodile",
        "description": "Asynchronous reconciler with candidate ranking.",
        "default_base_url": CROCODILE_DEFAULT_BASE_URL,
        "base_url_env": "CROCODILE_BASE_URL",
        "api_key_env": "CROCODILE_API_KEY",
        "requires_api_key": True,
        "uses_shared_llm": False,
        "supports_top_k": True,
        "supports_async_jobs": True,
        "extra_fields": []
    },
    {
        "id": "refined",
        "label": "ReFinED",
        "description": "ReFinED entity linking API with background job processing.",
        "default_base_url": REFINED_DEFAULT_BASE_URL,
        "base_url_env": "REFINED_BASE_URL",
        "api_key_env": "REFINED_API_KEY",
        "requires_api_key": True,
        "uses_shared_llm": False,
        "supports_top_k": True,
        "supports_async_jobs": True,
        "extra_fields": []
    },
    {
        "id": "wikidata",
        "label": "Wikidata Reconciler",
        "description": "Public OpenRefine-compatible Wikidata reconciliation endpoint.",
        "default_base_url": WIKIDATA_DEFAULT_BASE_URL,
        "base_url_env": "WIKIDATA_RECON_BASE_URL",
        "api_key_env": "WIKIDATA_RECON_API_KEY",
        "requires_api_key": False,
        "uses_shared_llm": False,
        "supports_top_k": True,
        "supports_async_jobs": False,
        "extra_fields": []
    }
]
RECONCILIATION_PROVIDER_CONFIG = {
    entry["id"]: entry
    for entry in RECONCILIATION_PROVIDER_DEFINITIONS
}
PROFILE_SERVICE_DEFINITIONS: List[Dict[str, Any]] = [
    *RECONCILIATION_PROVIDER_DEFINITIONS,
    {
        "id": "moose",
        "label": "Moose",
        "description": "Column auto-identification and DPV annotation service.",
        "default_base_url": "https://moose.zooverse.dev",
        "base_url_env": "MOOSE_BASE_URL",
        "api_key_env": "MOOSE_API_KEY",
        "requires_api_key": True,
        "uses_shared_llm": True,
        "supports_top_k": False,
        "supports_async_jobs": True,
        "extra_fields": []
    }
]
PROFILE_SERVICE_CONFIG = {entry["id"]: entry for entry in PROFILE_SERVICE_DEFINITIONS}
RECONCILIATION_PROVIDERS = set(RECONCILIATION_PROVIDER_CONFIG.keys())
PROFILE_SERVICE_PROVIDERS = set(PROFILE_SERVICE_CONFIG.keys())


def normalize_reconciliation_provider(value: Optional[str]) -> str:
    provider = normalize_optional_value(value) or DEFAULT_RECONCILIATION_PROVIDER
    if provider not in RECONCILIATION_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported reconciliation provider.")
    return provider


def normalize_profile_service_provider(value: Optional[str]) -> str:
    provider = normalize_optional_value(value) or DEFAULT_RECONCILIATION_PROVIDER
    if provider not in PROFILE_SERVICE_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported profile service provider.")
    return provider


def get_reconciliation_provider_definition(provider: str) -> Dict[str, Any]:
    return RECONCILIATION_PROVIDER_CONFIG.get(provider, {})


def get_reconciliation_provider_order() -> List[str]:
    return [entry["id"] for entry in RECONCILIATION_PROVIDER_DEFINITIONS]


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
    requires_key = bool(provider and provider.lower() != "ollama")
    if requires_key and not api_key:
        missing.append("LLM_API_KEY")

    return {
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "endpoint": endpoint,
        "requires_api_key": requires_key,
        "is_configured": len(missing) == 0,
        "missing": missing
    }


def resolve_service_base_url(
    credentials: Optional[UserServiceCredential],
    env_var: str,
    default_base_url: str
) -> str:
    base_url = normalize_optional_value(credentials.base_url) if credentials and credentials.base_url else None
    if not base_url:
        base_url = normalize_optional_value(os.getenv(env_var)) or default_base_url
    return base_url.rstrip("/")


def resolve_service_api_key(
    credentials: Optional[UserServiceCredential],
    env_var: str
) -> Optional[str]:
    api_key = normalize_optional_value(credentials.api_key) if credentials and credentials.api_key else None
    if not api_key:
        api_key = normalize_optional_value(os.getenv(env_var))
    return api_key


def load_profile_service_base_config(
    db: Session,
    user_email: str,
    service: str
) -> Dict[str, Any]:
    service_definition = PROFILE_SERVICE_CONFIG.get(service)
    if not service_definition:
        raise HTTPException(status_code=500, detail=f"Unknown service provider '{service}'.")

    credentials = get_user_service_credentials(db, user_email, service)
    base_url = resolve_service_base_url(
        credentials,
        service_definition["base_url_env"],
        service_definition["default_base_url"]
    )
    api_key = resolve_service_api_key(credentials, service_definition["api_key_env"])
    requires_api_key = bool(service_definition.get("requires_api_key"))
    missing: List[str] = []
    if requires_api_key and not api_key:
        missing.append(f"{service_definition['label']} API key")

    return {
        "service": service,
        "label": service_definition["label"],
        "base_url": base_url,
        "api_key": api_key,
        "requires_api_key": requires_api_key,
        "uses_shared_llm": bool(service_definition.get("uses_shared_llm")),
        "missing": missing
    }


def load_moose_service_config(
    db: Session,
    user_email: str
) -> Dict[str, Any]:
    config = load_profile_service_base_config(db, user_email, "moose")
    return {
        "base_url": config["base_url"],
        "api_key": config["api_key"],
        "missing": config["missing"]
    }


def load_moose_config(
    db: Session,
    user_email: str,
    llm_provider_override: Optional[str] = None,
    llm_model_override: Optional[str] = None,
    user_settings: Optional[UserLLMSettings] = None
) -> Dict[str, Any]:
    moose_service = load_moose_service_config(db, user_email)
    llm_config = load_llm_config(llm_provider_override, llm_model_override, user_settings)
    missing = list(moose_service["missing"]) + list(llm_config["missing"])

    return {
        "base_url": moose_service["base_url"],
        "api_key": moose_service["api_key"],
        "llm_provider": llm_config["provider"],
        "llm_model": llm_config["model"],
        "llm_api_key": llm_config["api_key"],
        "llm_endpoint": llm_config["endpoint"],
        "schema": MOOSE_DEFAULT_SCHEMA,
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


def load_moose_status_config(db: Session, user_email: str) -> Dict[str, Any]:
    service_config = load_moose_service_config(db, user_email)
    return {
        "base_url": service_config["base_url"],
        "api_key": service_config["api_key"],
        "request_timeout": MOOSE_REQUEST_TIMEOUT_SECONDS,
        "missing": service_config["missing"]
    }


def load_lion_config(
    db: Session,
    user_email: str,
    user_settings: Optional[UserLLMSettings] = None,
    require_llm: bool = False
) -> Dict[str, Any]:
    service_config = load_profile_service_base_config(db, user_email, "lion_linker")
    llm_config = {
        "provider": None,
        "model": None,
        "api_key": None,
        "endpoint": None,
        "requires_api_key": False,
        "missing": []
    }
    if require_llm:
        llm_config = load_llm_config(user_settings=user_settings)
    missing: List[str] = list(service_config["missing"])
    if require_llm:
        missing.extend(llm_config["missing"])

    return {
        "base_url": service_config["base_url"],
        "api_key": service_config["api_key"],
        "llm_provider": llm_config["provider"],
        "llm_model": llm_config["model"],
        "llm_api_key": llm_config["api_key"],
        "llm_endpoint": llm_config["endpoint"],
        "llm_requires_api_key": llm_config["requires_api_key"],
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
        "missing": missing
    }


def load_crocodile_config(
    db: Session,
    user_email: str
) -> Dict[str, Any]:
    service_config = load_profile_service_base_config(db, user_email, "crocodile")

    return {
        "base_url": service_config["base_url"],
        "api_key": service_config["api_key"],
        "request_timeout": CROCODILE_REQUEST_TIMEOUT_SECONDS,
        "poll_interval": CROCODILE_POLL_INTERVAL_SECONDS,
        "poll_timeout": CROCODILE_POLL_TIMEOUT_SECONDS,
        "missing": service_config["missing"]
    }


def load_refined_config(
    db: Session,
    user_email: str
) -> Dict[str, Any]:
    service_config = load_profile_service_base_config(db, user_email, "refined")
    return {
        "base_url": service_config["base_url"],
        "api_key": service_config["api_key"],
        "request_timeout": REFINED_REQUEST_TIMEOUT_SECONDS,
        "poll_interval": REFINED_POLL_INTERVAL_SECONDS,
        "poll_timeout": REFINED_POLL_TIMEOUT_SECONDS,
        "missing": service_config["missing"]
    }


def load_wikidata_config(
    db: Session,
    user_email: str
) -> Dict[str, Any]:
    service_config = load_profile_service_base_config(db, user_email, "wikidata")
    return {
        "base_url": service_config["base_url"],
        "api_key": service_config["api_key"],
        "request_timeout": WIKIDATA_REQUEST_TIMEOUT_SECONDS,
        "missing": service_config["missing"]
    }


def build_lion_headers(config: Dict[str, Any]) -> Dict[str, str]:
    headers = {
        "Accept": "application/json",
        "X-API-Key": config["api_key"]
    }
    if config.get("llm_api_key"):
        headers["X-LLM-API-Key"] = config["llm_api_key"]
    if config.get("llm_endpoint"):
        headers["X-LLM-Endpoint"] = config["llm_endpoint"]
    return headers


def build_crocodile_headers(config: Dict[str, Any]) -> Dict[str, str]:
    return {
        "Accept": "application/json",
        "X-API-Key": config["api_key"]
    }


def build_refined_headers(config: Dict[str, Any]) -> Dict[str, str]:
    return {
        "Accept": "application/json",
        "X-API-Key": config["api_key"]
    }


def build_wikidata_headers(config: Dict[str, Any]) -> Dict[str, str]:
    headers = {"Accept": "application/json"}
    if config.get("api_key"):
        headers["X-API-Key"] = config["api_key"]
    return headers


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


def create_refined_job(config: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{config['base_url']}/jobs"
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.post(url, json=payload, headers=build_refined_headers(config))
    response.raise_for_status()
    return response.json()


def get_refined_job_status(config: Dict[str, Any], job_id: str) -> Dict[str, Any]:
    url = f"{config['base_url']}/jobs/{job_id}"
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.get(url, headers=build_refined_headers(config))
    response.raise_for_status()
    return response.json()


def get_refined_job_results(
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
        response = client.get(url, headers=build_refined_headers(config), params=params)
    response.raise_for_status()
    return response.json()


def reconcile_wikidata_query(
    config: Dict[str, Any],
    query: str,
    limit: int = 5
) -> List[Dict[str, Any]]:
    mention = normalize_optional_value(query)
    if not mention:
        return []

    encoded_query = json.dumps(
        {"q0": {"query": mention, "limit": max(1, min(int(limit or 5), 100))}},
        separators=(",", ":")
    )
    url = f"{config['base_url']}/api"
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.get(
            url,
            params={"queries": encoded_query},
            headers=build_wikidata_headers(config)
        )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        return []
    item = payload.get("q0")
    if not isinstance(item, dict):
        return []
    results = item.get("result")
    if not isinstance(results, list):
        return []
    candidates: List[Dict[str, Any]] = []
    for rank, candidate in enumerate(results, start=1):
        if not isinstance(candidate, dict):
            continue
        types = candidate.get("type")
        if not isinstance(types, list):
            types = []

        raw_score = parse_score_value(candidate.get("score"))
        normalized_score = None
        if raw_score is not None:
            normalized_score = raw_score
            if normalized_score > 1:
                normalized_score = normalized_score / 100.0
            normalized_score = max(0.0, min(normalized_score, 1.0))

        candidates.append({
            "rank": rank,
            "id": candidate.get("id"),
            "name": candidate.get("name"),
            "score": normalized_score,
            "confidence_score": normalized_score,
            "description": candidate.get("description"),
            "types": types,
            "match": rank == 1,
            "metadata": {
                "raw_score": raw_score,
                "features": candidate.get("features") if isinstance(candidate.get("features"), list) else []
            }
        })
    return candidates


def serialize_reconciliation_settings(db: Session, user_email: str) -> Dict[str, Any]:
    llm_settings = get_user_llm_settings(db, user_email)
    try:
        llm_config = load_llm_config(user_settings=llm_settings)
    except HTTPException:
        provider = normalize_optional_value(llm_settings.provider) if llm_settings and llm_settings.provider else None
        model = normalize_optional_value(llm_settings.model) if llm_settings and llm_settings.model else None
        endpoint = normalize_optional_value(llm_settings.endpoint) if llm_settings and llm_settings.endpoint else None
        api_key = normalize_optional_value(llm_settings.api_key) if llm_settings and llm_settings.api_key else None
        requires_key = bool(provider and provider.lower() != "ollama")
        missing = []
        if not provider:
            missing.append("LLM_PROVIDER")
        if not model:
            missing.append("LLM_MODEL")
        if requires_key and not api_key:
            missing.append("LLM_API_KEY")
        llm_config = {
            "provider": provider,
            "model": model,
            "api_key": api_key,
            "endpoint": endpoint,
            "requires_api_key": requires_key,
            "is_configured": False,
            "missing": missing
        }

    def dedupe(values: List[str]) -> List[str]:
        seen: Set[str] = set()
        out: List[str] = []
        for value in values:
            if not value or value in seen:
                continue
            seen.add(value)
            out.append(value)
        return out

    llm_missing_labels: List[str] = []
    for item in llm_config.get("missing") or []:
        if item == "LLM_PROVIDER":
            llm_missing_labels.append("LLM provider")
        elif item == "LLM_MODEL":
            llm_missing_labels.append("LLM model")
        elif item == "LLM_API_KEY":
            llm_missing_labels.append("LLM API key")
        else:
            llm_missing_labels.append(str(item))

    llm_payload = {
        "provider": llm_config["provider"],
        "model": llm_config["model"],
        "endpoint": llm_config["endpoint"],
        "has_api_key": bool(llm_config["api_key"]),
        "requires_api_key": bool(llm_config["requires_api_key"]),
        "is_configured": bool(llm_config["is_configured"]),
        "missing": llm_missing_labels
    }

    available_providers = get_reconciliation_provider_order()
    reconciler_payloads: Dict[str, Dict[str, Any]] = {}
    retriever_config = load_lion_retriever_config(db, user_email)
    for provider_id in available_providers:
        provider_definition = get_reconciliation_provider_definition(provider_id)
        provider_config = load_profile_service_base_config(db, user_email, provider_id)
        missing: List[str] = list(provider_config["missing"])
        payload: Dict[str, Any] = {
            "id": provider_id,
            "label": provider_definition.get("label") or provider_id,
            "description": provider_definition.get("description") or "",
            "base_url": provider_config["base_url"],
            "requires_api_key": bool(provider_config["requires_api_key"]),
            "has_api_key": bool(provider_config["api_key"]),
            "uses_shared_llm": bool(provider_config["uses_shared_llm"]),
            "supports_top_k": bool(provider_definition.get("supports_top_k", True)),
            "supports_async_jobs": bool(provider_definition.get("supports_async_jobs", True)),
            "fields": provider_definition.get("extra_fields") or [],
            "field_values": {},
            "missing": [],
            "is_ready": False
        }
        if provider_id == "lion_linker":
            payload.update({
                "has_lamapi_token": bool(retriever_config.get("token")),
                "lamapi_endpoint": retriever_config.get("endpoint"),
                "lamapi_kg": retriever_config.get("kg"),
                "lamapi_num_candidates": retriever_config.get("num_candidates"),
                "uses_shared_llm": True,
                "field_values": {
                    "lamapi_endpoint": retriever_config.get("endpoint"),
                    "lamapi_kg": retriever_config.get("kg"),
                    "lamapi_num_candidates": retriever_config.get("num_candidates"),
                    "lamapi_token": {
                        "has_value": bool(retriever_config.get("token"))
                    }
                }
            })
            missing.extend(retriever_config.get("missing") or [])
            missing.extend(llm_payload.get("missing") or [])
        payload["missing"] = dedupe(missing)
        payload["is_ready"] = len(payload["missing"]) == 0
        reconciler_payloads[provider_id] = payload

    moose_config = load_profile_service_base_config(db, user_email, "moose")
    moose_missing = dedupe(list(moose_config["missing"]) + list(llm_payload.get("missing") or []))
    moose_payload = {
        "base_url": moose_config["base_url"],
        "has_api_key": bool(moose_config["api_key"]),
        "requires_api_key": bool(moose_config["requires_api_key"]),
        "uses_shared_llm": True,
        "missing": moose_missing,
        "is_ready": len(moose_missing) == 0
    }

    lion_payload = reconciler_payloads.get("lion_linker", {})
    crocodile_payload = reconciler_payloads.get("crocodile", {})
    refined_payload = reconciler_payloads.get("refined", {})
    wikidata_payload = reconciler_payloads.get("wikidata", {})

    return {
        "provider": DEFAULT_RECONCILIATION_PROVIDER,
        "available_providers": available_providers,
        "reconciler_provider_order": available_providers,
        "reconciler_providers": reconciler_payloads,
        "reconcilers": reconciler_payloads,
        "lion_base_url": lion_payload.get("base_url"),
        "crocodile_base_url": crocodile_payload.get("base_url"),
        "refined_base_url": refined_payload.get("base_url"),
        "wikidata_base_url": wikidata_payload.get("base_url"),
        "moose_base_url": moose_payload["base_url"],
        "has_api_key": bool(lion_payload.get("has_api_key")),
        "has_llm_api_key": llm_payload["has_api_key"],
        "has_lamapi_token": bool(lion_payload.get("has_lamapi_token")),
        "lamapi_endpoint": lion_payload.get("lamapi_endpoint"),
        "lamapi_kg": lion_payload.get("lamapi_kg"),
        "lamapi_num_candidates": lion_payload.get("lamapi_num_candidates"),
        "crocodile_has_api_key": bool(crocodile_payload.get("has_api_key")),
        "refined_has_api_key": bool(refined_payload.get("has_api_key")),
        "wikidata_has_api_key": bool(wikidata_payload.get("has_api_key")),
        "moose_has_api_key": moose_payload["has_api_key"],
        "llm": llm_payload,
        "lion_linker": lion_payload,
        "crocodile": crocodile_payload,
        "refined": refined_payload,
        "wikidata": wikidata_payload,
        "moose": moose_payload
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

    table_identifier = f"{dataset_name}.{table_name}"
    payload = {
        "schema": schema_override or config["schema"],
        "table_id": table_identifier,
        "sampled_rows": sampled_rows,
        "llm": {
            "provider": config["llm_provider"],
            "model": config["llm_model"]
        }
    }

    url = f"{config['base_url']}/tabular/annotate"
    with httpx.Client(timeout=config["request_timeout"]) as client:
        response = client.post(url, json=payload, headers=build_moose_headers(config))

    if response.status_code >= 400:
        detail = f"Moose request failed ({response.status_code})."
        response_body = normalize_optional_value(response.text)
        if response_body:
            detail = f"{detail} {response_body[:400]}"
        raise HTTPException(
            status_code=502,
            detail=detail
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
            status = normalize_moose_job_status(payload)
            if status in MOOSE_COMPLETED_STATUSES:
                return payload
            if status in MOOSE_FAILED_STATUSES:
                raise RuntimeError(f"Moose job {job_id} failed with status '{status}'.")
            time.sleep(config["poll_interval"])
    raise TimeoutError(f"Moose job {job_id} did not complete in time.")


def normalize_moose_job_status(job_payload: Dict[str, Any]) -> str:
    if not isinstance(job_payload, dict):
        return ""
    for status_value in (
        job_payload.get("status"),
        (job_payload.get("job") or {}).get("status") if isinstance(job_payload.get("job"), dict) else None
    ):
        normalized = normalize_optional_value(status_value)
        if normalized:
            return normalized.lower()
    return ""


def iterate_moose_result_columns(job_payload: Dict[str, Any]):
    def walk(node: Any):
        if isinstance(node, dict):
            columns = node.get("columns")
            if isinstance(columns, list):
                for column in columns:
                    if isinstance(column, dict):
                        yield column

            looks_like_column = (
                any(key in node for key in ("column", "column_name", "name", "header", "field"))
                and any(
                    key in node
                    for key in ("type_id", "coarse_type_id", "specific_type_id", "type", "semantic_type", "dpv_type_id")
                )
            )
            if looks_like_column:
                yield node

            for key in ("result", "results", "tables", "tasks", "annotations", "predictions", "items"):
                nested = node.get(key)
                if isinstance(nested, (dict, list)):
                    yield from walk(nested)
        elif isinstance(node, list):
            for item in node:
                yield from walk(item)

    if isinstance(job_payload, dict):
        yield from walk(job_payload)


def extract_moose_column_name(column: Dict[str, Any]) -> str:
    for key in ("column", "column_name", "name", "header", "field", "attribute"):
        value = normalize_optional_value(column.get(key))
        if value:
            return normalize_name(value)
    return ""


def extract_moose_column_types(column: Dict[str, Any]) -> Dict[str, Any]:
    specific = None
    for key in ("type_id", "specific_type_id", "specific_type", "type", "semantic_type", "dpv_type_id"):
        value = normalize_optional_value(column.get(key))
        if value:
            specific = value
            break

    coarse = None
    for key in ("coarse_type_id", "coarse_type", "coarse", "category", "group"):
        value = normalize_optional_value(column.get(key))
        if value:
            coarse = value
            break

    fine = None
    for key in ("fine_type_id", "fine_type", "fineTypeId", "fineType"):
        value = normalize_optional_value(column.get(key))
        if value:
            fine = value
            break

    if not specific and coarse:
        specific = coarse
    if not coarse and specific:
        coarse = specific

    confidence = (
        parse_score_value(column.get("confidence"))
        if isinstance(column, dict)
        else None
    )
    if confidence is None:
        confidence = parse_score_value(column.get("score")) if isinstance(column, dict) else None

    fine_confidence = (
        parse_score_value(column.get("fine_confidence"))
        if isinstance(column, dict)
        else None
    )
    if fine_confidence is None and isinstance(column, dict):
        fine_confidence = parse_score_value(column.get("fine_score"))

    return {
        "specific": specific,
        "coarse": coarse,
        "fine": fine,
        "confidence": confidence,
        "fine_confidence": fine_confidence
    }


def is_ne_moose_type(type_id: Optional[str], coarse_type: Optional[str]) -> bool:
    for raw in (type_id, coarse_type):
        if not raw:
            continue
        normalized = raw.strip().upper()
        if normalized == "NE" or normalized.startswith("NE:"):
            return True
    return False


def extract_moose_classification(
    header: List[str],
    job_payload: Dict[str, Any]
) -> Dict[str, Dict[int, Any]]:
    classification = {"NE": {}, "LIT": {}}
    header_lookup = {
        normalize_name(name).lower(): idx
        for idx, name in enumerate(header)
    }
    for column in iterate_moose_result_columns(job_payload):
        column_name = extract_moose_column_name(column)
        if not column_name:
            continue
        idx = header_lookup.get(column_name.lower())
        if idx is None:
            continue

        type_values = extract_moose_column_types(column)
        type_id = type_values["specific"]
        coarse_type = type_values["coarse"]
        if not type_id:
            continue

        value_payload: Dict[str, Any] = {
            "type_id": type_id,
            "coarse_type_id": coarse_type or type_id
        }
        if type_values.get("fine"):
            value_payload["fine_type_id"] = type_values["fine"]
        if type_values.get("confidence") is not None:
            value_payload["confidence"] = type_values["confidence"]
        if type_values.get("fine_confidence") is not None:
            value_payload["fine_confidence"] = type_values["fine_confidence"]

        group = "NE" if is_ne_moose_type(type_id, coarse_type) else "LIT"
        classification[group][idx] = value_payload
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
    for column in iterate_moose_result_columns(job_payload):
        column_name = extract_moose_column_name(column)
        if not column_name:
            continue
        idx = header_lookup.get(column_name.lower())
        if idx is None:
            continue

        type_values = extract_moose_column_types(column)
        type_id = type_values["specific"]
        if not type_id:
            continue
        annotation_payload = {
            "type_id": str(type_id),
            "confidence": (
                type_values.get("confidence")
                if type_values.get("confidence") is not None
                else column.get("confidence", column.get("score"))
            ),
            "distribution": column.get("distribution", column.get("probabilities"))
        }
        if type_values.get("coarse"):
            annotation_payload["coarse_type_id"] = type_values["coarse"]
        if type_values.get("fine"):
            annotation_payload["fine_type_id"] = type_values["fine"]
        if type_values.get("fine_confidence") is not None:
            annotation_payload["fine_confidence"] = type_values["fine_confidence"]
        annotations[idx] = annotation_payload
    return annotations


def apply_column_classification(
    db: Session,
    table: TableDB,
    classification: Dict[str, Dict[int, Any]],
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
    recompute_row_reconciliation_scores(db, table)
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


def has_existing_column_classification(table: TableDB) -> bool:
    classified_columns = table.classified_columns if isinstance(table.classified_columns, dict) else {}
    ne_entries = classified_columns.get("NE", {}) if isinstance(classified_columns.get("NE", {}), dict) else {}
    lit_entries = classified_columns.get("LIT", {}) if isinstance(classified_columns.get("LIT", {}), dict) else {}
    return bool(ne_entries or lit_entries)


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
    elif provider == "refined":
        provider_weight = 0.99
    elif provider == "wikidata":
        provider_weight = 0.97
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
    touched_rows: Set[int] = set()
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
            touched_rows.add(mapped_row)
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
            cell.score = extract_reconciliation_cell_score(candidate_ranking, final_value)
            cell.candidate_ranking = candidate_ranking
            cell.explanation = entry.get("explanation")
            cell.updated_at = datetime.utcnow()
        db.commit()
        cursor = payload.get("next_cursor")
        if not cursor:
            break

    table = db.query(TableDB).filter(TableDB.id == job.table_id).first()
    if table and touched_rows:
        recompute_row_reconciliation_scores(
            db,
            table,
            provider=job.provider,
            row_ids=list(touched_rows)
        )
    mark_reconciliation_column_types_stale(db, job.table_id)
    job.synced_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    db.commit()


def sync_refined_results(
    db: Session,
    job: ReconciliationJobDB,
    config: Dict[str, Any]
) -> None:
    touched_rows: Set[int] = set()
    cursor = None
    while True:
        payload = get_refined_job_results(config, job.external_job_id, cursor=cursor, limit=200)
        results = payload.get("results") or []
        for entry in results:
            row_idx = entry.get("row")
            col_idx = entry.get("col")
            mapped_row = map_reconciliation_row(job, row_idx)
            mapped_col = map_reconciliation_col(job, col_idx)
            if mapped_row is None or mapped_col is None:
                continue
            touched_rows.add(mapped_row)
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
                        "confidence_score": winning.get("confidence_score") or winning.get("score"),
                        "match": winning.get("match")
                    }
            cell.job_id = job.id
            cell.external_job_id = job.external_job_id
            cell.mention = entry.get("mention")
            cell.cell_id = entry.get("cell_id")
            cell.final = final_value
            cell.score = extract_reconciliation_cell_score(candidate_ranking, final_value)
            cell.candidate_ranking = candidate_ranking
            cell.explanation = entry.get("explanation")
            cell.updated_at = datetime.utcnow()
        db.commit()
        cursor = payload.get("next_cursor")
        if not cursor:
            break

    table = db.query(TableDB).filter(TableDB.id == job.table_id).first()
    if table and touched_rows:
        recompute_row_reconciliation_scores(
            db,
            table,
            provider=job.provider,
            row_ids=list(touched_rows)
        )
    mark_reconciliation_column_types_stale(db, job.table_id)
    job.synced_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    db.commit()


def sync_crocodile_results(
    db: Session,
    job: ReconciliationJobDB,
    config: Dict[str, Any]
) -> None:
    touched_rows: Set[int] = set()
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
            touched_rows.add(mapped_row)
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
            cell.score = extract_reconciliation_cell_score(candidate_ranking, final_value)
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

    if table and touched_rows:
        recompute_row_reconciliation_scores(
            db,
            table,
            provider=job.provider,
            row_ids=list(touched_rows)
        )
    mark_reconciliation_column_types_stale(db, job.table_id)
    job.synced_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    db.commit()


def sync_wikidata_results(
    db: Session,
    table: TableDB,
    job: ReconciliationJobDB,
    config: Dict[str, Any],
    top_k: int = 5
) -> None:
    touched_rows: Set[int] = set()

    def persist_progress(
        phase: str,
        *,
        processed_mentions: Optional[int] = None,
        total_mentions: Optional[int] = None,
        processed_cells: Optional[int] = None,
        total_cells: Optional[int] = None,
        failed_mentions: Optional[int] = None,
        last_error: Optional[str] = None,
        force: bool = False
    ) -> None:
        previous = dict(job.progress or {})
        next_progress = dict(previous)
        next_progress["phase"] = phase
        if processed_mentions is not None:
            next_progress["processed_mentions"] = max(0, int(processed_mentions))
        if total_mentions is not None:
            next_progress["total_mentions"] = max(0, int(total_mentions))
        if processed_cells is not None:
            next_progress["processed_cells"] = max(0, int(processed_cells))
        if total_cells is not None:
            next_progress["total_cells"] = max(0, int(total_cells))
        if failed_mentions is not None:
            next_progress["failed_mentions"] = max(0, int(failed_mentions))
        if last_error:
            next_progress["last_error"] = str(last_error)
        elif failed_mentions == 0:
            next_progress.pop("last_error", None)

        percent: Optional[float] = None
        cells_total = next_progress.get("total_cells")
        cells_done = next_progress.get("processed_cells")
        mentions_total = next_progress.get("total_mentions")
        mentions_done = next_progress.get("processed_mentions")
        if isinstance(cells_total, int) and cells_total > 0 and isinstance(cells_done, int):
            percent = max(0.0, min(100.0, (float(cells_done) / float(cells_total)) * 100.0))
        elif isinstance(mentions_total, int) and mentions_total > 0 and isinstance(mentions_done, int):
            percent = max(0.0, min(100.0, (float(mentions_done) / float(mentions_total)) * 100.0))
        elif phase in {"completed", "done", "succeeded", "success", "finished"}:
            percent = 100.0
        elif phase in {"queued", "preparing"}:
            percent = 0.0
        if percent is not None:
            next_progress["percent"] = round(percent, 2)

        if force or next_progress != previous:
            job.progress = next_progress
            job.updated_at = datetime.utcnow()
            db.commit()

    row_ids = [int(value) for value in (job.row_map or []) if isinstance(value, int) or str(value).isdigit()]
    selected_columns = [
        int(value)
        for value in (job.selected_columns or [])
        if isinstance(value, int) or str(value).isdigit()
    ]
    if not row_ids or not selected_columns:
        persist_progress(
            "completed",
            processed_mentions=0,
            total_mentions=0,
            processed_cells=0,
            total_cells=0,
            failed_mentions=0,
            force=True
        )
        job.synced_at = datetime.utcnow()
        job.updated_at = datetime.utcnow()
        db.commit()
        return

    selected_cells = {
        (int(item.get("row")), int(item.get("col")))
        for item in (job.selected_cells or [])
        if isinstance(item, dict)
        and item.get("row") is not None
        and item.get("col") is not None
        and (isinstance(item.get("row"), int) or str(item.get("row")).isdigit())
        and (isinstance(item.get("col"), int) or str(item.get("col")).isdigit())
    }
    has_cell_filter = len(selected_cells) > 0

    rows = (
        db.query(RowDB)
        .filter(RowDB.table_id == table.id, RowDB.id_row.in_(row_ids))
        .order_by(RowDB.id_row.asc())
        .all()
    )

    target_cells: List[tuple] = []
    for row in rows:
        data = row.data or []
        for col_idx in selected_columns:
            if col_idx < 0 or col_idx >= len(table.header or []):
                continue
            if has_cell_filter and (row.id_row, col_idx) not in selected_cells:
                continue
            mention = normalize_optional_value(data[col_idx] if col_idx < len(data) else "")
            if not mention:
                continue
            target_cells.append((row.id_row, col_idx, mention))

    total_cells = len(target_cells)
    if total_cells == 0:
        persist_progress(
            "completed",
            processed_mentions=0,
            total_mentions=0,
            processed_cells=0,
            total_cells=0,
            failed_mentions=0,
            force=True
        )
        mark_reconciliation_column_types_stale(db, job.table_id)
        job.synced_at = datetime.utcnow()
        job.updated_at = datetime.utcnow()
        db.commit()
        return

    unique_mentions = sorted({mention for _, _, mention in target_cells})
    total_mentions = len(unique_mentions)
    mention_cache: Dict[str, List[Dict[str, Any]]] = {}
    failed_mentions = 0
    last_error: Optional[str] = None
    persist_progress(
        "querying",
        processed_mentions=0,
        total_mentions=total_mentions,
        processed_cells=0,
        total_cells=total_cells,
        failed_mentions=0,
        force=True
    )

    if total_mentions > 0:
        max_workers = min(16, max(1, total_mentions))
        mention_update_stride = max(1, total_mentions // 20)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_mention = {
                executor.submit(reconcile_wikidata_query, config, mention, top_k): mention
                for mention in unique_mentions
            }
            processed_mentions = 0
            for future in as_completed(future_to_mention):
                mention = future_to_mention[future]
                try:
                    mention_cache[mention] = future.result() or []
                except Exception as exc:
                    failed_mentions += 1
                    last_error = str(exc)
                    mention_cache[mention] = []
                    logger.warning("Wikidata query failed for mention '%s': %s", mention, exc)
                processed_mentions += 1
                if processed_mentions == total_mentions or processed_mentions % mention_update_stride == 0:
                    persist_progress(
                        "querying",
                        processed_mentions=processed_mentions,
                        total_mentions=total_mentions,
                        processed_cells=0,
                        total_cells=total_cells,
                        failed_mentions=failed_mentions,
                        last_error=last_error
                    )

    persist_progress(
        "applying",
        processed_mentions=total_mentions,
        total_mentions=total_mentions,
        processed_cells=0,
        total_cells=total_cells,
        failed_mentions=failed_mentions,
        last_error=last_error
    )

    scoped_rows = sorted({row_id for row_id, _, _ in target_cells})
    scoped_cols = sorted({col_idx for _, col_idx, _ in target_cells})
    existing_cells: Dict[tuple, ReconciliationCellDB] = {}
    if scoped_rows and scoped_cols:
        existing = (
            db.query(ReconciliationCellDB)
            .filter(
                ReconciliationCellDB.table_id == job.table_id,
                ReconciliationCellDB.provider == job.provider,
                ReconciliationCellDB.row_id.in_(scoped_rows),
                ReconciliationCellDB.col_idx.in_(scoped_cols)
            )
            .all()
        )
        existing_cells = {(cell.row_id, cell.col_idx): cell for cell in existing}

    processed_cells = 0
    pending_since_commit = 0
    cell_update_stride = max(1, total_cells // 20)
    for row_id, col_idx, mention in target_cells:
        candidate_ranking = mention_cache.get(mention) or []
        final_value: Dict[str, Any] = {}
        if candidate_ranking:
            winning = candidate_ranking[0]
            final_value = {
                "id": winning.get("id"),
                "name": winning.get("name"),
                "types": winning.get("types"),
                "description": winning.get("description"),
                "confidence_score": winning.get("confidence_score") or winning.get("score"),
                "match": True
            }

        cell = existing_cells.get((row_id, col_idx))
        if not cell:
            cell = ReconciliationCellDB(
                table_id=job.table_id,
                row_id=row_id,
                col_idx=col_idx,
                provider=job.provider
            )
            db.add(cell)
            existing_cells[(row_id, col_idx)] = cell

        cell.job_id = job.id
        cell.external_job_id = job.external_job_id
        cell.mention = mention
        cell.cell_id = f"{row_id}:{col_idx}"
        cell.final = final_value
        cell.score = extract_reconciliation_cell_score(candidate_ranking, final_value)
        cell.candidate_ranking = candidate_ranking
        cell.explanation = None
        cell.updated_at = datetime.utcnow()

        touched_rows.add(row_id)
        processed_cells += 1
        pending_since_commit += 1

        if pending_since_commit >= 200:
            db.commit()
            pending_since_commit = 0

        if processed_cells == total_cells or processed_cells % cell_update_stride == 0:
            if pending_since_commit > 0:
                db.commit()
                pending_since_commit = 0
            persist_progress(
                "applying",
                processed_mentions=total_mentions,
                total_mentions=total_mentions,
                processed_cells=processed_cells,
                total_cells=total_cells,
                failed_mentions=failed_mentions,
                last_error=last_error
            )

    if pending_since_commit > 0:
        db.commit()

    if table and touched_rows:
        recompute_row_reconciliation_scores(
            db,
            table,
            provider=job.provider,
            row_ids=list(touched_rows)
        )
    mark_reconciliation_column_types_stale(db, job.table_id)

    final_progress = dict(job.progress or {})
    final_progress.update({
        "phase": "completed",
        "processed_mentions": total_mentions,
        "total_mentions": total_mentions,
        "processed_cells": total_cells,
        "total_cells": total_cells,
        "failed_mentions": failed_mentions,
        "percent": 100.0
    })
    if failed_mentions > 0 and last_error:
        final_progress["last_error"] = last_error
    elif failed_mentions == 0:
        final_progress.pop("last_error", None)
    job.progress = final_progress
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
        provider = job.provider or DEFAULT_RECONCILIATION_PROVIDER
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
        elif provider == "refined":
            config = load_refined_config(db, dataset.owner_email)
            if config["missing"]:
                job.status = "error"
                job.error = {"detail": "Missing ReFinED configuration", "missing": config["missing"]}
                job.updated_at = datetime.utcnow()
                db.commit()
                return
            sync_refined_results(db, job, config)
        elif provider == "wikidata":
            config = load_wikidata_config(db, dataset.owner_email)
            if config["missing"]:
                job.status = "error"
                job.error = {"detail": "Missing Wikidata Reconciler configuration", "missing": config["missing"]}
                progress = dict(job.progress or {})
                progress["phase"] = "failed"
                progress["last_error"] = "Missing Wikidata Reconciler configuration"
                job.progress = progress
                job.updated_at = datetime.utcnow()
                db.commit()
                return
            sync_wikidata_results(db, table, job, config, top_k=job.top_k or 5)
            job.status = "completed"
            job.updated_at = datetime.utcnow()
            db.commit()
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

        provider = job.provider or DEFAULT_RECONCILIATION_PROVIDER
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

        if provider == "refined":
            config = load_refined_config(db, dataset.owner_email)
            if config["missing"]:
                job.status = "error"
                job.error = {"detail": "Missing ReFinED configuration", "missing": config["missing"]}
                job.updated_at = datetime.utcnow()
                db.commit()
                return

            success_statuses = {"done", "completed", "succeeded", "success", "finished"}
            failure_statuses = {"failed", "error", "canceled", "cancelled"}
            deadline = time.time() + config["poll_timeout"]
            while time.time() < deadline:
                payload = get_refined_job_status(config, job.external_job_id)
                status = (payload.get("status") or "").lower()
                if status:
                    job.status = status
                    job.updated_at = datetime.utcnow()
                    db.commit()
                if status in success_statuses:
                    try:
                        sync_refined_results(db, job, config)
                        job.status = "completed"
                        job.updated_at = datetime.utcnow()
                        db.commit()
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

        if provider == "wikidata":
            config = load_wikidata_config(db, dataset.owner_email)
            if config["missing"]:
                job.status = "error"
                job.error = {"detail": "Missing Wikidata Reconciler configuration", "missing": config["missing"]}
                progress = dict(job.progress or {})
                progress["phase"] = "failed"
                progress["last_error"] = "Missing Wikidata Reconciler configuration"
                job.progress = progress
                job.updated_at = datetime.utcnow()
                db.commit()
                return
            job.status = "running"
            progress = dict(job.progress or {})
            progress["phase"] = "querying"
            progress["percent"] = 0.0
            job.progress = progress
            job.updated_at = datetime.utcnow()
            db.commit()
            try:
                sync_wikidata_results(db, table, job, config, top_k=job.top_k or 5)
                job.status = "completed"
                job.updated_at = datetime.utcnow()
                db.commit()
            except Exception as exc:
                job.status = "sync_failed"
                job.error = {"detail": str(exc)}
                progress = dict(job.progress or {})
                progress["phase"] = "failed"
                progress["last_error"] = str(exc)
                job.progress = progress
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


def serialize_admin_user(user: UserDB) -> Dict[str, Any]:
    return {
        "email": user.email,
        "role": user.role or "user",
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "password_hash": user.password
    }


def count_admin_users(db: Session) -> int:
    return db.query(func.count(UserDB.id)).filter(UserDB.role == "admin").scalar() or 0


def serialize_row(row: RowDB) -> Dict[str, Any]:
    return {
        "idRow": row.id_row,
        "data": row.data or [],
        "row_score": row.row_score,
        "reconciliation_score": row.reconciliation_score,
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


def build_reconciliation_object_rows(
    header: List[str],
    rows: List[RowDB],
    selected_columns: List[int],
    cell_whitelist: Optional[Set[tuple]] = None
) -> List[Dict[str, Any]]:
    selected_header = [header[idx] for idx in selected_columns]
    object_rows: List[Dict[str, Any]] = []
    for row in rows:
        row_payload: Dict[str, Any] = {}
        data = row.data or []
        for selected_idx, col_idx in enumerate(selected_columns):
            value = data[col_idx] if col_idx < len(data) else ""
            if cell_whitelist is not None and (row.id_row, col_idx) not in cell_whitelist:
                value = ""
            row_payload[selected_header[selected_idx]] = value
        object_rows.append(row_payload)
    return object_rows


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


def extract_candidate_score(candidate: Any) -> Optional[float]:
    if not isinstance(candidate, dict):
        return None
    for key in ("confidence_score", "score"):
        value = parse_score_value(candidate.get(key))
        if value is not None:
            return value
    return None


def extract_reconciliation_cell_score(
    candidate_ranking: Any,
    final_value: Any = None
) -> Optional[float]:
    # The persisted per-cell score is the score from the top-ranked candidate.
    if isinstance(candidate_ranking, list) and candidate_ranking:
        top = extract_candidate_score(candidate_ranking[0])
        if top is not None:
            return top
    if isinstance(final_value, dict):
        fallback = extract_candidate_score(final_value)
        if fallback is not None:
            return fallback
    return 0.0


def build_row_types(row: List[Any], classification: Dict[str, Dict[int, Any]]) -> List[str]:
    row_types: List[str] = []
    if not classification:
        return row_types
    for idx, subtype in classification.get("NE", {}).items():
        normalized_subtype = extract_classification_value(subtype)
        if normalized_subtype and idx < len(row) and normalize_cell(row[idx]):
            row_types.append(normalized_subtype)
    for idx, subtype in classification.get("LIT", {}).items():
        normalized_subtype = extract_classification_value(subtype, prefer_coarse=True)
        if normalized_subtype and idx < len(row) and normalize_cell(row[idx]):
            row_types.append(normalized_subtype)
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


def build_reconciliation_score_expression():
    return ReconciliationCellDB.score


def get_ne_column_indices(table: TableDB) -> List[int]:
    header = table.header or []
    classified_columns = table.classified_columns if isinstance(table.classified_columns, dict) else {}
    classified_ne = classified_columns.get("NE", {}) if isinstance(classified_columns.get("NE", {}), dict) else {}
    columns: List[int] = []
    for raw_idx in classified_ne.keys():
        try:
            idx = int(raw_idx)
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(header):
            columns.append(idx)
    return sorted(set(columns))


def recompute_row_reconciliation_scores(
    db: Session,
    table: TableDB,
    provider: Optional[str] = None,
    row_ids: Optional[List[int]] = None
) -> None:
    if not table:
        return
    ne_columns = get_ne_column_indices(table)
    target_row_ids_set: Set[int] = set()
    for raw_row_id in row_ids or []:
        try:
            target_row_ids_set.add(int(raw_row_id))
        except (TypeError, ValueError):
            continue
    target_row_ids = sorted(target_row_ids_set)
    now = datetime.utcnow()

    reset_stmt = update(RowDB).where(RowDB.table_id == table.id)
    if target_row_ids:
        reset_stmt = reset_stmt.where(RowDB.id_row.in_(target_row_ids))
    reset_stmt = reset_stmt.values(reconciliation_score=None, updated_at=now)
    db.execute(reset_stmt)

    if not ne_columns:
        db.flush()
        return

    score_expr = build_reconciliation_score_expression()
    score_for_avg = func.coalesce(score_expr, literal(0.0))
    avg_query = select(
        ReconciliationCellDB.row_id.label("row_id"),
        func.avg(score_for_avg).label("avg_score")
    ).where(
        ReconciliationCellDB.table_id == table.id,
        ReconciliationCellDB.col_idx.in_(ne_columns)
    )
    if provider:
        avg_query = avg_query.where(ReconciliationCellDB.provider == provider)
    if target_row_ids:
        avg_query = avg_query.where(ReconciliationCellDB.row_id.in_(target_row_ids))
    avg_query = avg_query.group_by(ReconciliationCellDB.row_id)
    avg_scores = avg_query.subquery()

    update_stmt = (
        update(RowDB)
        .where(RowDB.table_id == table.id, RowDB.id_row == avg_scores.c.row_id)
        .values(reconciliation_score=avg_scores.c.avg_score, updated_at=now)
    )
    if target_row_ids:
        update_stmt = update_stmt.where(RowDB.id_row.in_(target_row_ids))
    db.execute(update_stmt)
    db.flush()


def build_reconciliation_type_conditions(type_values: List[str]) -> List[Any]:
    conditions: List[Any] = []
    seen: Set[str] = set()
    for raw_value in type_values:
        value = normalize_optional_value(raw_value)
        if not value or value in seen:
            continue
        seen.add(value)
        conditions.append(
            or_(
                ReconciliationCellDB.final.contains({"types": [{"id": value}]}),
                ReconciliationCellDB.final.contains({"types": [{"name": value}]}),
                ReconciliationCellDB.final.contains({"types": [value]})
            )
        )
    return conditions


def extract_reconciliation_types(value: Any) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return []
    items: List[Dict[str, str]] = []
    seen: Set[str] = set()
    for entry in value:
        type_id = None
        type_name = None
        if isinstance(entry, dict):
            type_id = (
                normalize_optional_value(entry.get("id")) or
                normalize_optional_value(entry.get("entity_id")) or
                normalize_optional_value(entry.get("name")) or
                normalize_optional_value(entry.get("label"))
            )
            type_name = (
                normalize_optional_value(entry.get("name")) or
                normalize_optional_value(entry.get("label")) or
                type_id
            )
        elif isinstance(entry, str):
            clean = normalize_optional_value(entry)
            type_id = clean
            type_name = clean

        if not type_id:
            continue
        dedupe_key = type_id.strip().lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        items.append({
            "id": type_id,
            "name": type_name or type_id
        })
    return items


def format_reconciliation_types_for_csv(value: Any) -> str:
    entries = extract_reconciliation_types(value)
    if not entries:
        return ""
    formatted: List[str] = []
    for entry in entries:
        type_id = normalize_optional_value(entry.get("id")) or ""
        type_name = normalize_optional_value(entry.get("name")) or ""
        if type_id and type_name:
            formatted.append(f"{type_id}:{type_name}")
        elif type_id:
            formatted.append(type_id)
        elif type_name:
            formatted.append(type_name)
    return " | ".join(formatted)


def extract_final_score_value(final_payload: Dict[str, Any], cell_score: Optional[float]) -> Optional[float]:
    if cell_score is not None:
        return float(cell_score)
    return parse_score_value(final_payload.get("score"))


def extract_reconciliation_export_value(
    field: str,
    final_payload: Dict[str, Any],
    cell_score: Optional[float]
) -> str:
    if field == "id":
        return normalize_optional_value(final_payload.get("id")) or ""
    if field == "name":
        return normalize_optional_value(final_payload.get("name")) or ""
    if field == "description":
        return normalize_optional_value(final_payload.get("description")) or ""
    if field == "types":
        return format_reconciliation_types_for_csv(final_payload.get("types"))
    if field == "score":
        value = extract_final_score_value(final_payload, cell_score)
        return str(value) if value is not None else ""
    if field == "match":
        match = final_payload.get("match")
        if isinstance(match, bool):
            return "true" if match else "false"
        return ""
    return ""


def build_reconciliation_type_summary(
    db: Session,
    table_id: int,
    provider: Optional[str] = None
) -> List[Dict[str, Any]]:
    query = db.query(ReconciliationCellDB.final).filter(ReconciliationCellDB.table_id == table_id)
    if provider:
        query = query.filter(ReconciliationCellDB.provider == provider)
    rows = query.all()

    counts: Dict[str, Dict[str, Any]] = {}
    typed_cells = 0
    for (final_value,) in rows:
        final_payload = final_value if isinstance(final_value, dict) else {}
        types = extract_reconciliation_types(final_payload.get("types"))
        if not types:
            continue
        typed_cells += 1
        for item in types:
            type_id = item["id"]
            entry = counts.setdefault(type_id, {
                "id": type_id,
                "name": item["name"],
                "count": 0
            })
            entry["count"] += 1

    if typed_cells == 0:
        return []

    summary: List[Dict[str, Any]] = []
    for entry in counts.values():
        frequency = entry["count"] / typed_cells
        summary.append({
            "id": entry["id"],
            "name": entry["name"],
            "count": entry["count"],
            "frequency": round(frequency, 6),
            "description": f"Appears in {entry['count']} linked cell(s)."
        })
    summary.sort(key=lambda item: (item.get("count", 0), item.get("frequency", 0), item.get("name", "")), reverse=True)
    return summary


def build_reconciliation_score_range(
    db: Session,
    table_id: int,
    provider: Optional[str] = None
) -> Dict[str, Optional[float]]:
    score_expr = build_reconciliation_score_expression()
    score_for_stats = func.coalesce(score_expr, literal(0.0))
    query = db.query(
        func.min(score_for_stats).label("min_score"),
        func.max(score_for_stats).label("max_score")
    ).filter(ReconciliationCellDB.table_id == table_id)
    if provider:
        query = query.filter(ReconciliationCellDB.provider == provider)
    result = query.one_or_none()
    min_score = float(result.min_score) if result and result.min_score is not None else None
    max_score = float(result.max_score) if result and result.max_score is not None else None
    return {
        "min": round(min_score, 6) if min_score is not None else None,
        "max": round(max_score, 6) if max_score is not None else None
    }


def build_reconciliation_row_score_subquery(
    db: Session,
    table_id: int,
    provider: Optional[str] = None,
    col_idx: Optional[int] = None,
    ne_columns: Optional[List[int]] = None
):
    score_expr = build_reconciliation_score_expression()
    score_for_avg = func.coalesce(score_expr, literal(0.0))
    query = db.query(
        ReconciliationCellDB.row_id.label("row_id"),
        func.avg(score_for_avg).label("link_score")
    ).filter(
        ReconciliationCellDB.table_id == table_id
    )
    if provider:
        query = query.filter(ReconciliationCellDB.provider == provider)
    if col_idx is not None:
        query = query.filter(ReconciliationCellDB.col_idx == col_idx)
    elif ne_columns is not None:
        if ne_columns:
            query = query.filter(ReconciliationCellDB.col_idx.in_(ne_columns))
        else:
            query = query.filter(literal(False))
    return query.group_by(ReconciliationCellDB.row_id).subquery()


def build_reconciliation_row_confidence_map(
    db: Session,
    table_id: int,
    row_ids: List[int],
    provider: Optional[str] = None,
    ne_columns: Optional[List[int]] = None
) -> Dict[int, Optional[float]]:
    if not row_ids:
        return {}
    score_expr = build_reconciliation_score_expression()
    score_for_avg = func.coalesce(score_expr, literal(0.0))
    query = db.query(
        ReconciliationCellDB.row_id.label("row_id"),
        func.avg(score_for_avg).label("row_confidence")
    ).filter(
        ReconciliationCellDB.table_id == table_id,
        ReconciliationCellDB.row_id.in_(row_ids)
    )
    if provider:
        query = query.filter(ReconciliationCellDB.provider == provider)
    if ne_columns is not None:
        if ne_columns:
            query = query.filter(ReconciliationCellDB.col_idx.in_(ne_columns))
        else:
            query = query.filter(literal(False))
    rows = query.group_by(ReconciliationCellDB.row_id).all()
    result: Dict[int, Optional[float]] = {}
    for row in rows:
        if row.row_confidence is None:
            result[row.row_id] = None
        else:
            result[row.row_id] = round(float(row.row_confidence), 6)
    return result


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
def ensure_table_rows_schema():
    inspector = inspect(engine)
    if "table_rows" not in inspector.get_table_names():
        return
    existing_columns = {col["name"] for col in inspector.get_columns("table_rows")}
    if "reconciliation_score" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE table_rows ADD COLUMN IF NOT EXISTS reconciliation_score DOUBLE PRECISION")
            )
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_rows_table_reconciliation_score "
                "ON table_rows (table_id, reconciliation_score)"
            )
        )


@app.on_event("startup")
def ensure_reconciliation_jobs_schema():
    inspector = inspect(engine)
    if "reconciliation_jobs" not in inspector.get_table_names():
        return
    existing_columns = {col["name"] for col in inspector.get_columns("reconciliation_jobs")}
    columns_to_add = {
        "top_k": "INTEGER",
        "progress": "JSONB"
    }
    for column, ddl in columns_to_add.items():
        if column not in existing_columns:
            with engine.begin() as conn:
                conn.execute(
                    text(f"ALTER TABLE reconciliation_jobs ADD COLUMN IF NOT EXISTS {column} {ddl}")
                )


@app.on_event("startup")
def ensure_reconciliation_cells_schema():
    inspector = inspect(engine)
    if "reconciliation_cells" not in inspector.get_table_names():
        return
    existing_columns = {col["name"] for col in inspector.get_columns("reconciliation_cells")}
    columns_to_add = {
        "score": "DOUBLE PRECISION",
        "candidate_ranking": "JSONB",
        "explanation": "TEXT"
    }
    for column, ddl in columns_to_add.items():
        if column not in existing_columns:
            with engine.begin() as conn:
                conn.execute(
                    text(f"ALTER TABLE reconciliation_cells ADD COLUMN IF NOT EXISTS {column} {ddl}")
                )
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_reconciliation_cells_table_provider_row "
                "ON reconciliation_cells (table_id, provider, row_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_reconciliation_cells_table_provider_col_row "
                "ON reconciliation_cells (table_id, provider, col_idx, row_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_reconciliation_cells_table_provider_col_score "
                "ON reconciliation_cells (table_id, provider, col_idx, score)"
            )
        )
        conn.execute(
            text(
                "UPDATE reconciliation_cells "
                "SET score = COALESCE("
                "NULLIF(candidate_ranking->0->>'confidence_score', '')::double precision, "
                "NULLIF(candidate_ranking->0->>'score', '')::double precision, "
                "NULLIF(final->>'confidence_score', '')::double precision, "
                "NULLIF(final->>'score', '')::double precision, "
                "0.0"
                ") "
                "WHERE score IS NULL"
            )
        )


@app.on_event("startup")
def backfill_row_reconciliation_scores():
    db = SessionLocal()
    try:
        table_ids = [
            row[0]
            for row in (
                db.query(ReconciliationCellDB.table_id)
                .filter(ReconciliationCellDB.score.isnot(None))
                .distinct()
                .all()
            )
            if row and row[0] is not None
        ]
        for table_id in table_ids:
            table = db.query(TableDB).filter(TableDB.id == table_id).first()
            if not table:
                continue
            recompute_row_reconciliation_scores(db, table)
        db.commit()
    finally:
        db.close()


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


@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    refresh_token = create_refresh_token(data={"sub": user.email, "role": user.role})
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "email": user.email,
        "role": user.role
    }


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
        return {
            "access_token": access_token,
            "refresh_token": payload.refresh_token,
            "token_type": "bearer",
            "email": user.email,
            "role": user.role
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/users/me", response_model=dict)
def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "email": current_user["email"],
        "role": current_user["role"]
    }


@app.get("/users/me/llm-settings", response_model=dict)
def get_llm_settings(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    settings = get_user_llm_settings(db, current_user["email"])
    provider = settings.provider if settings else None
    model = settings.model if settings else None
    endpoint = settings.endpoint if settings else None
    has_api_key = bool(settings.api_key) if settings else bool(normalize_optional_value(os.getenv("LLM_API_KEY")))
    requires_api_key = bool(provider and provider.lower() != "ollama")
    is_configured = bool(provider and model and ((not requires_api_key) or has_api_key))
    return {
        "provider": provider,
        "model": model,
        "endpoint": endpoint,
        "has_api_key": has_api_key,
        "requires_api_key": requires_api_key,
        "is_configured": is_configured,
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
        "has_api_key": bool(settings.api_key),
        "requires_api_key": bool(settings.provider and settings.provider.lower() != "ollama"),
        "is_configured": bool(
            settings.provider and
            settings.model and
            (
                settings.provider.lower() == "ollama" or
                bool(settings.api_key)
            )
        )
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
    provider = normalize_profile_service_provider(payload.provider)

    credentials = get_user_service_credentials(db, current_user["email"], provider)
    if not credentials:
        credentials = UserServiceCredential(user_email=current_user["email"], service=provider)
        db.add(credentials)

    if payload.base_url is not None:
        credentials.base_url = normalize_optional_value(payload.base_url)
    if payload.api_key is not None:
        credentials.api_key = normalize_optional_value(payload.api_key)
    if provider == "lion_linker":
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


@app.get("/admin/users", response_model=dict)
def list_users_admin(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    is_admin_user(current_user)
    users = db.query(UserDB).order_by(UserDB.created_at.asc(), UserDB.email.asc()).all()
    return {
        "users": [serialize_admin_user(user) for user in users]
    }


@app.post("/admin/users", response_model=dict)
def create_user_admin(
    payload: AdminUserCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_admin_user(current_user)
    email = normalize_optional_value(payload.email)
    password = normalize_optional_value(payload.password)
    role = normalize_user_role(payload.role)
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    if not password:
        raise HTTPException(status_code=400, detail="Password is required.")
    existing = db.query(UserDB).filter(UserDB.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    user = UserDB(
        email=email,
        password=get_password_hash(password),
        role=role,
        created_at=datetime.utcnow()
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "msg": "User created successfully",
        "user": serialize_admin_user(user)
    }


@app.put("/admin/users/{email}", response_model=dict)
def update_user_admin(
    email: str,
    payload: AdminUserUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_admin_user(current_user)
    target_email = normalize_optional_value(email)
    if not target_email:
        raise HTTPException(status_code=400, detail="Email is required.")
    user = db.query(UserDB).filter(UserDB.email == target_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    password_changed = False
    role_changed = False

    if payload.password is not None:
        next_password = normalize_optional_value(payload.password)
        if not next_password:
            raise HTTPException(status_code=400, detail="Password cannot be empty.")
        user.password = get_password_hash(next_password)
        password_changed = True

    if payload.role is not None:
        next_role = normalize_user_role(payload.role)
        if user.role == "admin" and next_role != "admin" and count_admin_users(db) <= 1:
            raise HTTPException(status_code=400, detail="At least one admin account is required.")
        if user.role != next_role:
            user.role = next_role
            role_changed = True

    if not password_changed and not role_changed:
        raise HTTPException(status_code=400, detail="No changes supplied.")

    db.commit()
    db.refresh(user)
    return {
        "msg": "User updated successfully",
        "user": serialize_admin_user(user)
    }


@app.delete("/admin/users/{email}", response_model=dict)
def delete_user_admin(
    email: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_admin_user(current_user)
    target_email = normalize_optional_value(email)
    if not target_email:
        raise HTTPException(status_code=400, detail="Email is required.")
    user = db.query(UserDB).filter(UserDB.email == target_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin" and count_admin_users(db) <= 1:
        raise HTTPException(status_code=400, detail="At least one admin account is required.")
    db.delete(user)
    db.commit()
    return {"msg": f"User {target_email} deleted successfully"}


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
        moose_config = load_moose_config(
            db,
            current_user["email"],
            llm_provider,
            llm_model,
            user_settings
        )
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
    include_types: Optional[List[str]] = Query(None),
    exclude_types: Optional[List[str]] = Query(None),
    include_ne_types: Optional[List[str]] = Query(None),
    exclude_ne_types: Optional[List[str]] = Query(None),
    sort_by: Optional[str] = None,
    sort_direction: Optional[str] = None,
    sort_confidence_column: Optional[int] = Query(None, ge=0),
    next_cursor: Optional[str] = Query(None),
    prev_cursor: Optional[str] = Query(None),
    reconciliation_provider: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    resolved_page = resolve_page(page, next_cursor, prev_cursor)
    per_page = min(100, max(1, per_page))
    provider_filter = normalize_optional_value(reconciliation_provider)
    if provider_filter:
        provider_filter = normalize_reconciliation_provider(provider_filter)

    excluded_types: Set[str] = set()
    for entry in (table.column_types or {}).values():
        for type_entry in entry.get("types", []) if isinstance(entry, dict) else []:
            type_id = type_entry.get("id")
            if type_id:
                excluded_types.add(type_id)
    ne_columns = get_ne_column_indices(table)

    def resolve_score_scope(
        mode_raw: Optional[str],
        column_raw: Optional[int],
        require_column: bool = False
    ) -> tuple:
        mode_value = (normalize_optional_value(mode_raw) or "score_avg").lower()
        if mode_value not in {"score", "score_avg"}:
            raise HTTPException(
                status_code=400,
                detail="Unsupported score mode. Use 'score' or 'score_avg'."
            )
        if mode_value == "score":
            if column_raw is None:
                if require_column:
                    raise HTTPException(
                        status_code=400,
                        detail="A score column must be provided for score mode."
                    )
                return None, None
            if column_raw < 0 or column_raw >= len(table.header or []):
                raise HTTPException(status_code=400, detail="Score column index is out of range.")
            if column_raw not in ne_columns:
                raise HTTPException(status_code=400, detail="Score column must point to an NE column.")
            return column_raw, None
        return None, ne_columns

    query = db.query(RowDB).filter(RowDB.table_id == table.id)

    if search:
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

    include_ne_filtered = [value for value in (include_ne_types or []) if normalize_optional_value(value)]
    exclude_ne_filtered = [value for value in (exclude_ne_types or []) if normalize_optional_value(value)]
    include_ne_conditions = build_reconciliation_type_conditions(include_ne_filtered)
    exclude_ne_conditions = build_reconciliation_type_conditions(exclude_ne_filtered)

    if include_ne_conditions:
        include_rows_query = db.query(ReconciliationCellDB.row_id).filter(
            ReconciliationCellDB.table_id == table.id
        )
        if provider_filter:
            include_rows_query = include_rows_query.filter(ReconciliationCellDB.provider == provider_filter)
        include_rows_query = include_rows_query.filter(or_(*include_ne_conditions))
        include_rows_subq = include_rows_query.distinct().subquery()
        query = query.filter(RowDB.id_row.in_(select(include_rows_subq.c.row_id)))

    if exclude_ne_conditions:
        exclude_rows_query = db.query(ReconciliationCellDB.row_id).filter(
            ReconciliationCellDB.table_id == table.id
        )
        if provider_filter:
            exclude_rows_query = exclude_rows_query.filter(ReconciliationCellDB.provider == provider_filter)
        exclude_rows_query = exclude_rows_query.filter(or_(*exclude_ne_conditions))
        exclude_rows_subq = exclude_rows_query.distinct().subquery()
        query = query.filter(~RowDB.id_row.in_(select(exclude_rows_subq.c.row_id)))

    total_matches = query.count()
    total_rows = table.total_rows or (
        db.query(func.count(RowDB.id)).filter(RowDB.table_id == table.id).scalar() or 0
    )
    row_type_summary = build_row_type_summary(db, table.id, total_rows, excluded_types)
    reconciliation_type_summary = build_reconciliation_type_summary(db, table.id, provider_filter)
    reconciliation_score_range = build_reconciliation_score_range(db, table.id, provider_filter)

    resolved_sort_by = (sort_by or "").lower()
    resolved_direction = (sort_direction or "").lower()
    sort_desc = resolved_direction == "desc"

    if resolved_sort_by in {"score", "score_avg", "link_score", "reconciliation_score"}:
        sort_conf_col = None
        sort_conf_ne_cols = None
        if resolved_sort_by == "score":
            sort_conf_col, sort_conf_ne_cols = resolve_score_scope(
                "score",
                sort_confidence_column,
                require_column=True
            )
        else:
            sort_conf_col, sort_conf_ne_cols = resolve_score_scope("score_avg", None)

        if sort_conf_col is None and not sort_conf_ne_cols:
            query = query.order_by(RowDB.id_row.asc())
        else:
            row_score_subq = build_reconciliation_row_score_subquery(
                db,
                table.id,
                provider_filter,
                col_idx=sort_conf_col,
                ne_columns=sort_conf_ne_cols
            )
            link_score = func.coalesce(row_score_subq.c.link_score, literal(0.0))
            sort_column = (
                link_score.desc()
                if sort_desc
                else link_score.asc()
            )
            query = query.outerjoin(row_score_subq, RowDB.id_row == row_score_subq.c.row_id)
            query = query.order_by(sort_column, RowDB.id_row.asc())
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
    row_ids = [row.id_row for row in rows]
    row_confidence_map = build_reconciliation_row_confidence_map(
        db,
        table.id,
        row_ids,
        provider_filter,
        ne_columns=ne_columns
    )
    serialized_rows = []
    for row in rows:
        payload = serialize_row(row)
        payload["reconciliation_score"] = row_confidence_map.get(
            row.id_row,
            payload.get("reconciliation_score")
        )
        serialized_rows.append(payload)
    reconciliation_map: Dict[int, Dict[int, Any]] = {}
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
                "score": cell.score,
                "candidate_ranking": top_candidates,
                "explanation": cell.explanation,
                "updated_at": cell.updated_at.isoformat() if cell.updated_at else None
            }

    terminal_job_statuses = {
        "completed",
        "succeeded",
        "success",
        "done",
        "finished",
        "failed",
        "error",
        "canceled",
        "cancelled",
        "sync_failed",
        "timeout"
    }
    active_job_query = (
        db.query(ReconciliationJobDB)
        .filter(ReconciliationJobDB.table_id == table.id)
    )
    if provider_filter:
        active_job_query = active_job_query.filter(ReconciliationJobDB.provider == provider_filter)
    active_jobs = (
        active_job_query
        .order_by(ReconciliationJobDB.updated_at.desc().nulls_last(), ReconciliationJobDB.id.desc())
        .limit(20)
        .all()
    )
    active_job = next(
        (
            job
            for job in active_jobs
            if (job.status or "").lower() not in terminal_job_statuses
        ),
        None
    )
    active_job_payload = None
    if active_job:
        active_job_payload = {
            "job_id": active_job.id,
            "external_job_id": active_job.external_job_id,
            "provider": active_job.provider,
            "status": active_job.status,
            "scope": active_job.scope,
            "top_k": active_job.top_k,
            "progress": active_job.progress or {},
            "synced": bool(active_job.synced_at),
            "created_at": active_job.created_at.isoformat() if active_job.created_at else None,
            "updated_at": active_job.updated_at.isoformat() if active_job.updated_at else None
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
                "type_summary": reconciliation_type_summary,
                "score_range": reconciliation_score_range,
                "active_job": active_job_payload,
                "filters": {
                    "include_ne_types": include_ne_filtered,
                    "exclude_ne_types": exclude_ne_filtered,
                    "score_mode": "score" if resolved_sort_by == "score" else "score_avg",
                    "score_column": sort_confidence_column if resolved_sort_by == "score" else None,
                    "sort_confidence_column": sort_confidence_column
                },
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
    include_reconciliation: bool = Query(False),
    enrichment_fields: Optional[List[str]] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    rows_cursor = (
        db.query(RowDB)
        .filter(RowDB.table_id == table.id)
        .order_by(RowDB.id_row.asc())
        .all()
    )

    output = StringIO()
    writer = csv.writer(output)

    base_header = table.header or []
    header_row = list(base_header)
    valid_enrichment_fields = [
        "id",
        "name",
        "description",
        "types",
        "score",
        "match"
    ]
    selected_fields: List[str] = []
    if include_reconciliation:
        raw_fields = enrichment_fields or ["id", "name", "description", "types", "score"]
        for field in raw_fields:
            clean = normalize_optional_value(field)
            if clean and clean in valid_enrichment_fields and clean not in selected_fields:
                selected_fields.append(clean)

    enrichment_columns: List[int] = []
    reconciliation_by_cell: Dict[tuple, ReconciliationCellDB] = {}
    if include_reconciliation and selected_fields:
        enrichment_columns = get_ne_column_indices(table)
        if not enrichment_columns:
            column_query = (
                db.query(ReconciliationCellDB.col_idx)
                .filter(ReconciliationCellDB.table_id == table.id)
            )
            enrichment_columns = sorted({col for (col,) in column_query.distinct().all() if col is not None})

        if enrichment_columns:
            recon_query = db.query(ReconciliationCellDB).filter(ReconciliationCellDB.table_id == table.id)
            recon_query = recon_query.order_by(ReconciliationCellDB.updated_at.desc().nulls_last())
            for cell in recon_query.all():
                key = (cell.row_id, cell.col_idx)
                if key not in reconciliation_by_cell:
                    reconciliation_by_cell[key] = cell

            field_suffix_map = {
                "id": "link_id",
                "name": "link_name",
                "description": "link_description",
                "types": "link_types",
                "score": "link_score",
                "match": "link_match"
            }
            for col_idx in enrichment_columns:
                if col_idx < 0 or col_idx >= len(base_header):
                    continue
                col_name = base_header[col_idx]
                for field in selected_fields:
                    suffix = field_suffix_map[field]
                    header_row.append(f"{col_name}__{suffix}")

    writer.writerow(header_row)

    for row in rows_cursor:
        row_values = list(row.data or [])
        if include_reconciliation and selected_fields and enrichment_columns:
            for col_idx in enrichment_columns:
                cell = reconciliation_by_cell.get((row.id_row, col_idx))
                final_payload = cell.final if cell and isinstance(cell.final, dict) else {}
                cell_score = cell.score if cell else None
                for field in selected_fields:
                    row_values.append(
                        extract_reconciliation_export_value(field, final_payload, cell_score)
                    )
        writer.writerow(row_values)

    output.seek(0)
    filename_suffix = "_enriched" if include_reconciliation and selected_fields else ""
    filename = f"{dataset_name}_{table_name}_export{filename_suffix}.csv"
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
    force: Optional[bool] = Query(False),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"], db)
    header = table.header or []
    if not header:
        raise HTTPException(status_code=400, detail="Table header is empty.")
    if has_existing_column_classification(table) and not force:
        raise HTTPException(
            status_code=409,
            detail="This table already has a column classification. Confirm and retry to overwrite it."
        )

    user_settings = get_user_llm_settings(db, current_user["email"])
    config = load_moose_config(
        db,
        current_user["email"],
        llm_provider,
        llm_model,
        user_settings
    )
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
    config = load_moose_config(
        db,
        current_user["email"],
        llm_provider,
        llm_model,
        user_settings
    )
    if config["missing"]:
        missing = ", ".join(config["missing"])
        raise HTTPException(status_code=500, detail=f"Missing Moose configuration: {missing}")

    sampled_rows = build_sampled_rows(db, table.id, header, config["sample_size"])
    job_id = submit_moose_tabular_job(
        config,
        sampled_rows,
        dataset_name,
        table_name,
        schema_override="dpv_pd"
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

    config = load_moose_status_config(db, current_user["email"])
    if config["missing"]:
        missing = ", ".join(config["missing"])
        raise HTTPException(status_code=500, detail=f"Missing Moose configuration: {missing}")

    try:
        payload = get_moose_job_status(config, job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unable to fetch Moose job status: {exc}")

    status = normalize_moose_job_status(payload)
    if status in MOOSE_COMPLETED_STATUSES:
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
    if status in MOOSE_FAILED_STATUSES:
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

    config = load_moose_status_config(db, current_user["email"])
    if config["missing"]:
        missing = ", ".join(config["missing"])
        raise HTTPException(status_code=500, detail=f"Missing Moose configuration: {missing}")

    try:
        payload = get_moose_job_status(config, job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unable to fetch Moose job status: {exc}")

    status = normalize_moose_job_status(payload)
    if status in MOOSE_COMPLETED_STATUSES:
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
    if status in MOOSE_FAILED_STATUSES:
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
    selected_columns = sorted(set(ne_selected_columns))
    if scope == "cell":
        if cell_whitelist is not None:
            cell_whitelist = {cell for cell in cell_whitelist if cell[1] in selected_columns}
        selected_cells_payload = [entry for entry in selected_cells_payload if entry.get("col") in selected_columns]
        selected_rows = sorted({
            int(entry.get("row"))
            for entry in selected_cells_payload
            if entry.get("row") is not None
        })
        if not selected_rows:
            raise HTTPException(
                status_code=400,
                detail="No NE cells selected for reconciliation. Select cells in NE columns only."
            )

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
    link_columns = [header[idx] for idx in selected_columns]
    resolved_top_k = payload.top_k if payload.top_k is not None else 5
    try:
        resolved_top_k = int(resolved_top_k)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="top_k must be an integer between 1 and 100.")
    if resolved_top_k < 1 or resolved_top_k > 100:
        raise HTTPException(status_code=400, detail="top_k must be between 1 and 100.")

    external_job_id: Optional[str] = None
    status = "queued"

    if provider == "lion_linker":
        user_llm_settings = get_user_llm_settings(db, current_user["email"])
        config = load_lion_config(db, current_user["email"], user_llm_settings, require_llm=True)
        if config["missing"]:
            missing = ", ".join(config["missing"])
            raise HTTPException(status_code=500, detail=f"Missing Lion Linker configuration: {missing}")
        retriever_config = load_lion_retriever_config(db, current_user["email"])
        if retriever_config["missing"]:
            missing = ", ".join(retriever_config["missing"])
            raise HTTPException(status_code=500, detail=f"Missing Lamapi configuration: {missing}")
        model_provider = config.get("llm_provider")
        model_name = config.get("llm_model")
        if not model_provider or not model_name:
            raise HTTPException(
                status_code=400,
                detail="LLM provider and model are required. Set them in your profile."
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
            "top_k": resolved_top_k,
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
        external_job_id = job_response.get("job_id")
        status = (job_response.get("status") or "queued").lower()
    elif provider == "crocodile":
        config = load_crocodile_config(db, current_user["email"])
        if config["missing"]:
            missing = ", ".join(config["missing"])
            raise HTTPException(status_code=500, detail=f"Missing Crocodile configuration: {missing}")
        job_payload = {
            "mode": "inline",
            "header": inline_table.get("header") or [],
            "rows": inline_table.get("rows") or [],
            "link_columns": link_columns,
            "top_k": resolved_top_k,
            "config": {}
        }
        try:
            job_response = create_crocodile_job(config, job_payload)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Unable to create Crocodile job: {exc}")
        external_job_id = job_response.get("job_id")
        status = (job_response.get("status") or "queued").lower()
    elif provider == "refined":
        config = load_refined_config(db, current_user["email"])
        if config["missing"]:
            missing = ", ".join(config["missing"])
            raise HTTPException(status_code=500, detail=f"Missing ReFinED configuration: {missing}")
        object_rows = build_reconciliation_object_rows(header, rows, selected_columns, cell_whitelist)
        job_payload = {
            "mode": "inline",
            "header": inline_table.get("header") or [],
            "rows": object_rows,
            "link_columns": link_columns,
            "table_name": f"{dataset_name}.{table_name}",
            "top_k": resolved_top_k
        }
        try:
            job_response = create_refined_job(config, job_payload)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Unable to create ReFinED job: {exc}")
        external_job_id = job_response.get("job_id")
        status = (job_response.get("status") or "queued").lower()
    elif provider == "wikidata":
        config = load_wikidata_config(db, current_user["email"])
        if config["missing"]:
            missing = ", ".join(config["missing"])
            raise HTTPException(status_code=500, detail=f"Missing Wikidata Reconciler configuration: {missing}")
        external_job_id = uuid.uuid4().hex
        status = "queued"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported reconciliation provider '{provider}'.")

    if not external_job_id:
        raise HTTPException(status_code=502, detail=f"{provider} did not return a job_id.")

    initial_progress = {
        "phase": "queued",
        "processed_mentions": 0,
        "total_mentions": 0,
        "processed_cells": 0,
        "total_cells": 0,
        "failed_mentions": 0,
        "percent": 0.0
    } if provider == "wikidata" else {}

    job = ReconciliationJobDB(
        table_id=table.id,
        provider=provider,
        external_job_id=external_job_id,
        status=status,
        scope=scope,
        top_k=resolved_top_k,
        selected_rows=selected_rows or [],
        selected_columns=selected_columns or [],
        selected_cells=selected_cells_payload,
        row_map=row_map,
        col_map=selected_columns,
        progress=initial_progress,
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
        "top_k": job.top_k,
        "progress": job.progress or {},
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
        "top_k": job.top_k,
        "progress": job.progress or {},
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
        "score": cell.score,
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
    cell.score = extract_reconciliation_cell_score(cell.candidate_ranking, cell.final)
    cell.updated_at = datetime.utcnow()
    recompute_row_reconciliation_scores(db, table, provider=provider, row_ids=[row_idx])
    mark_reconciliation_column_types_stale(db, table.id)
    db.commit()

    return {
        "row": row_idx,
        "col": col_idx,
        "provider": provider,
        "score": cell.score,
        "final": cell.final
    }
