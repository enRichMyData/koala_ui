from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pymongo import MongoClient
from passlib.context import CryptContext
from jose import JWTError, jwt
from typing import List, Optional, Dict, Any, Tuple
from urllib.parse import urlparse
import os
import csv
import json
import math
import time
from io import StringIO
import requests
from datetime import datetime, timedelta

# Initialize FastAPI app
app = FastAPI(
    title="Koala API",
    description="API for managing users and authentication in Koala UI.",
    version="1.0.0",
    swagger_ui_parameters={"persistAuthorization": True},  # Keep authorization in Swagger UI
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
mongo_uri = os.getenv("MONGO_URI")
if not mongo_uri:
    raise RuntimeError("Environment variable MONGO_URI must be set")

client = MongoClient(mongo_uri)
db = client["koala_db"]  # Use "koala_db" as the default database name
datasets_collection = db["datasets"]
tables_collection = db["tables"]
rows_collection = db["table_rows"]

# JWT configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY environment variable is required")

# External linker configuration
LION_API_URL = os.getenv("LION_API_URL", "https://lion.zooverse.dev").rstrip("/")
LION_MODEL_NAME = os.getenv("LION_MODEL_NAME", "gpt-oss:20b")
LION_MODEL_PROVIDER = os.getenv("LION_MODEL_PROVIDER", "ollama")
LION_OLLAMA_HOST = os.getenv("LION_OLLAMA_HOST", "https://ollama.sct.sintef.no/")
LION_MODEL_API_KEY = os.getenv("LION_MODEL_API_KEY", "")
LION_CHUNK_SIZE = int(os.getenv("LION_CHUNK_SIZE", "64"))
LION_TABLE_CTX_SIZE = int(os.getenv("LION_TABLE_CTX_SIZE", "1"))
LION_RETRIEVER_ENDPOINT = os.getenv("LION_RETRIEVER_ENDPOINT", "https://lamapi.hel.sintef.cloud/lookup/entity-retrieval")
LION_RETRIEVER_TOKEN = os.getenv("LION_RETRIEVER_TOKEN", "")
LION_RETRIEVER_NUM_CANDIDATES = int(os.getenv("LION_RETRIEVER_NUM_CANDIDATES", "10"))
LION_RETRIEVER_KG = os.getenv("LION_RETRIEVER_KG", "wikidata")
LION_JOB_TIMEOUT = int(os.getenv("LION_JOB_TIMEOUT", "180"))
LION_STATUS_POLL_INTERVAL = float(os.getenv("LION_STATUS_POLL_INTERVAL", "2"))
LION_RESULT_PAGE_SIZE = int(os.getenv("LION_RESULT_PAGE_SIZE", "50"))

WIKIDATA_RECONCILE_URL = os.getenv("WIKIDATA_RECONCILE_URL", "https://wikidata.reconci.link/en/api").rstrip("/")
WIKIDATA_RECONCILE_LANG = os.getenv("WIKIDATA_RECONCILE_LANG", "en")
LINKING_MAX_ROWS = int(os.getenv("LINKING_MAX_ROWS", "200"))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Pydantic models
class User(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class DatasetCreate(BaseModel):
    dataset_name: str

class LinkingRequest(BaseModel):
    provider: str
    row_ids: List[int]
    column_indices: List[int]
    language: Optional[str] = None
    options: Optional[Dict[str, Any]] = None

class AnnotationPayload(BaseModel):
    entity_id: str
    match: bool = True
    score: float = 1.0
    notes: Optional[str] = ""
    candidate_info: Dict[str, Any]
    candidates: Optional[List[Dict[str, Any]]] = None
    explanation: Optional[str] = None

# Utility functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role", "user")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.users.find_one({"email": email})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["role"] = role  # Add role to the user object
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def is_admin_user(user: dict):
    """
    Check if the user has admin privileges.
    """
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

def normalize_name(value: str) -> str:
    if not value:
        return ""
    return value.strip()

def get_dataset_or_404(dataset_name: str, owner: str):
    dataset = datasets_collection.find_one({"dataset_name": dataset_name, "owner": owner})
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")
    return dataset

def get_table_or_404(dataset_name: str, table_name: str, owner: str):
    table = tables_collection.find_one({
        "dataset_name": dataset_name,
        "table_name": table_name,
        "owner": owner
    })
    if not table:
        raise HTTPException(
            status_code=404,
            detail=f"Table '{table_name}' not found in dataset '{dataset_name}'"
        )
    return table

def serialize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "idRow": row["idRow"],
        "data": row.get("data", []),
        "linked_entities": row.get("linked_entities", []),
        "annotationMeta": row.get("annotation_meta")
    }

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

def parse_column_classification(raw_value: Optional[str], header_length: int) -> Dict[str, Dict[int, str]]:
    if not raw_value:
        return {"NE": {}, "LIT": {}}
    try:
        payload = json.loads(raw_value)
    except json.JSONDecodeError as ex:
        raise HTTPException(status_code=400, detail=f"Invalid column classification JSON: {ex}") from ex

    result = {"NE": {}, "LIT": {}}
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

def build_column_type_summary(header: List[str], classification: Dict[str, Dict[int, str]]) -> Dict[int, Dict[str, Any]]:
    summary: Dict[int, Dict[str, Any]] = {}
    for idx in range(len(header)):
        types = []
        ne_value = classification.get("NE", {}).get(idx)
        lit_value = classification.get("LIT", {}).get(idx)
        if ne_value:
            types.append({"id": ne_value, "name": ne_value, "count": 0})
        if lit_value and not ne_value:
            types.append({"id": lit_value, "name": lit_value, "count": 0})
        if types:
            summary[idx] = {"types": types}
    return summary

def fetch_rows_by_ids(dataset_name: str, table_name: str, owner: str, row_ids: List[int]) -> List[Dict[str, Any]]:
    if not row_ids:
        return []
    query = {
        "dataset_name": dataset_name,
        "table_name": table_name,
        "owner": owner,
        "idRow": {"$in": row_ids}
    }
    docs = list(rows_collection.find(query))
    docs.sort(key=lambda doc: doc.get("idRow", 0))
    return docs

def extract_candidate_fields(entities: List[Dict[str, Any]], column_index: int, fields: List[str]) -> List[str]:
    if not fields:
        return []
    entity = next((item for item in entities if item.get("idColumn") == column_index), None)
    if not entity or not entity.get("candidates"):
        return ["" for _ in fields]
    candidate = entity["candidates"][0]
    values = []
    for field in fields:
        if field == "types":
            types = candidate.get("types", [])
            if isinstance(types, list):
                values.append(";".join(filter(None, [t.get("name") or t.get("id") for t in types if isinstance(t, dict)])))
            else:
                values.append("")
        else:
            values.append(str(candidate.get(field, ""))) if candidate.get(field) is not None else values.append("")
    return values

def build_lion_payload(
    dataset_name: str,
    table_name: str,
    header: List[str],
    rows: List[Dict[str, Any]],
    column_indices: List[int],
    row_ids: List[int],
    options: Optional[Dict[str, Any]] = None
) -> Tuple[List[Dict[str, Any]], Dict[int, int]]:
    mention_columns = [header[idx] for idx in column_indices]
    lion_rows = []
    row_id_lookup: Dict[int, int] = {}
    for lion_row_id, row in enumerate(rows):
        row_data = row.get("data", [])[:len(header)]
        if len(row_data) < len(header):
            row_data = row_data + [""] * (len(header) - len(row_data))
        original_row_id = row.get("idRow")
        row_id_lookup[lion_row_id] = original_row_id
        lion_rows.append({
            "idRow": lion_row_id,
            "data": row_data
        })

    lion_config = {
        "model_name": LION_MODEL_NAME,
        "model_api_provider": LION_MODEL_PROVIDER,
        "chunk_size": LION_CHUNK_SIZE,
        "table_ctx_size": LION_TABLE_CTX_SIZE,
        "format_candidates": True,
        "compact_candidates": True
    }
    if LION_OLLAMA_HOST:
        lion_config["ollama_host"] = LION_OLLAMA_HOST
    if LION_MODEL_API_KEY:
        lion_config["model_api_key"] = LION_MODEL_API_KEY

    retriever_config = {
        "class_path": "lion_linker.retrievers.LamapiClient",
        "endpoint": LION_RETRIEVER_ENDPOINT,
        "token": LION_RETRIEVER_TOKEN,
        "num_candidates": LION_RETRIEVER_NUM_CANDIDATES,
        "kg": LION_RETRIEVER_KG,
        "cache": False,
        "max_retries": 3,
        "backoff_factor": 0.5
    }

    overrides = options or {}
    lion_overrides = overrides.get("lionConfig") or overrides.get("lion_config")
    if isinstance(lion_overrides, dict):
        for key, value in lion_overrides.items():
            if value is not None:
                lion_config[key] = value
    retriever_overrides = overrides.get("retrieverConfig") or overrides.get("retriever_config")
    if isinstance(retriever_overrides, dict):
        for key, value in retriever_overrides.items():
            if value is not None:
                retriever_config[key] = value
    if overrides.get("model_api_key"):
        lion_config["model_api_key"] = overrides["model_api_key"]
    if overrides.get("ollama_host"):
        lion_config["ollama_host"] = overrides["ollama_host"]
    if overrides.get("retriever_token"):
        retriever_config["token"] = overrides["retriever_token"]
    if overrides.get("retriever_endpoint"):
        retriever_config["endpoint"] = overrides["retriever_endpoint"]

    def lion_requires_api_key() -> bool:
        host = (urlparse(LION_API_URL).hostname or "").lower()
        return host.endswith("lion.zooverse.dev")

    if lion_requires_api_key() and not lion_config.get("model_api_key"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Lion model API key missing. Set LION_MODEL_API_KEY in the backend "
                "environment or pass options.lionConfig.model_api_key when calling the linking endpoint."
            )
        )

    payload = [{
        "datasetName": dataset_name,
        "tableName": table_name,
        "header": header,
        "rows": lion_rows,
        "metadata": {
            "mentionColumns": mention_columns,
            "rowIds": row_ids,
            "columnIndices": column_indices
        },
        "lionConfig": lion_config,
        "retrieverConfig": retriever_config
    }]
    return payload, row_id_lookup

def submit_lion_job(payload: List[Dict[str, Any]]) -> Dict[str, Any]:
    try:
        response = requests.post(
            f"{LION_API_URL}/annotate",
            json=payload,
            headers={"accept": "application/json"},
            timeout=60
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Lion linking failed: {exc}") from exc

    jobs = response.json()
    if not isinstance(jobs, list) or not jobs:
        raise HTTPException(status_code=502, detail="Lion returned an empty response")

    job_info = jobs[0]
    if not job_info.get("jobId"):
        raise HTTPException(status_code=502, detail="Lion response missing jobId")
    return job_info

def poll_lion_job(job_id: str) -> Dict[str, Any]:
    start_time = time.time()
    poll_interval = max(0.5, LION_STATUS_POLL_INTERVAL)
    while time.time() - start_time < LION_JOB_TIMEOUT:
        try:
            status_response = requests.get(
                f"{LION_API_URL}/annotate/{job_id}",
                headers={"accept": "application/json"},
                timeout=30
            )
            status_response.raise_for_status()
        except requests.RequestException as exc:
            raise HTTPException(status_code=502, detail=f"Lion status check failed: {exc}") from exc

        status_payload = status_response.json()
        status_value = (status_payload.get("status") or "").lower()
        if status_value == "completed":
            return status_payload
        if status_value == "failed":
            raise HTTPException(status_code=502, detail=status_payload.get("message", "Lion job failed"))
        time.sleep(poll_interval)

    raise HTTPException(status_code=504, detail="Lion linking timed out")

def fetch_lion_results(dataset_id: str, table_id: str) -> Dict[str, Any]:
    if not dataset_id or not table_id:
        raise HTTPException(status_code=502, detail="Lion response missing datasetId/tableId")

    per_page = max(1, LION_RESULT_PAGE_SIZE)
    page = 1
    combined_rows: List[Dict[str, Any]] = []
    last_payload: Dict[str, Any] = {}

    while True:
        try:
            result_resp = requests.get(
                f"{LION_API_URL}/dataset/{dataset_id}/table/{table_id}",
                params={"page": page, "per_page": per_page},
                headers={"accept": "application/json"},
                timeout=60
            )
            print("Fetching Lion results:", result_resp)
            result_resp.raise_for_status()
        except requests.RequestException as exc:
            print("Error fetching Lion results:", exc)
            raise HTTPException(status_code=502, detail=f"Lion result fetch failed: {exc}") from exc

        payload = result_resp.json()
        last_payload = payload
        rows = payload.get("rows", [])
        combined_rows.extend(rows)

        if len(rows) < per_page:
            break
        page += 1

    last_payload = last_payload or {}
    last_payload["rows"] = combined_rows
    return last_payload

def parse_lion_answer_field(raw_answer: Any) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """
    Normalize Lion's answer payload which may arrive as a list, a dict with
    `candidate_ranking`, or a JSON-encoded string. Returns a tuple of
    (candidates, explanation).
    """
    explanation: Optional[str] = None
    parsed_answer: Any = raw_answer

    if isinstance(parsed_answer, str):
        parsed_answer = parsed_answer.strip()
        if parsed_answer:
            try:
                parsed_answer = json.loads(parsed_answer)
            except json.JSONDecodeError:
                parsed_answer = None

    candidate_entries: List[Dict[str, Any]] = []
    if isinstance(parsed_answer, dict):
        if isinstance(parsed_answer.get("candidate_ranking"), list):
            candidate_entries = parsed_answer.get("candidate_ranking") or []
            explanation = parsed_answer.get("explanation")
        elif isinstance(parsed_answer.get("answer"), list):
            candidate_entries = parsed_answer.get("answer") or []
        else:
            candidate_entries = [parsed_answer]
    elif isinstance(parsed_answer, list):
        candidate_entries = parsed_answer

    return candidate_entries or [], explanation

def transform_lion_results(
    result_data: Dict[str, Any],
    header: List[str],
    row_id_lookup: Optional[Dict[int, int]] = None
) -> List[Dict[str, Any]]:
    row_id_lookup = row_id_lookup or {}
    cells: List[Dict[str, Any]] = []
    for row in result_data.get("rows", []):
        lion_row_id = row.get("idRow")
        row_id = row_id_lookup.get(lion_row_id, lion_row_id)
        for prediction in row.get("predictions", []):
            column_name = prediction.get("column")
            if column_name not in header:
                continue
            column_index = header.index(column_name)
            raw_answer = prediction.get("answer")
            answers, explanation = parse_lion_answer_field(raw_answer)
            explanation = explanation or prediction.get("explanation")
            candidates = []
            for answer in answers:
                if not isinstance(answer, dict):
                    continue
                candidates.append({
                    "id": answer.get("id"),
                    "name": answer.get("name"),
                    "description": answer.get("description"),
                    "types": answer.get("types", []),
                    "score": answer.get("confidence_score"),
                    "match": answer.get("match", False),
                    "confidence_label": answer.get("confidence_label"),
                    "source": "lion"
                })
            if candidates:
                cell_payload = {
                    "rowId": row_id,
                    "columnIndex": column_index,
                    "columnName": column_name,
                    "candidates": candidates,
                    "identifier": prediction.get("identifier"),
                }
                if explanation:
                    cell_payload["explanation"] = explanation
                cells.append(cell_payload)
    return cells

def run_lion_linking(
    dataset_name: str,
    table_name: str,
    header: List[str],
    rows: List[Dict[str, Any]],
    column_indices: List[int],
    row_ids: List[int],
    options: Optional[Dict[str, Any]] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    payload, row_id_lookup = build_lion_payload(
        dataset_name,
        table_name,
        header,
        rows,
        column_indices,
        row_ids,
        options,
    )
    job_info = submit_lion_job(payload)
    print("Payload submitted to Lion:", json.dumps(payload))
    job_id = job_info.get("jobId")
    status_payload = poll_lion_job(job_id)
    dataset_id = status_payload.get("datasetId") or job_info.get("datasetId")
    table_id = status_payload.get("tableId") or job_info.get("tableId")
    result_payload = fetch_lion_results(dataset_id, table_id)
    print("Fetched Lion results:", json.dumps(result_payload))
    metadata = {
        "jobId": job_id,
        "datasetId": dataset_id,
        "tableId": table_id,
        "status": status_payload.get("status"),
        "message": status_payload.get("message"),
        "totalRows": status_payload.get("totalRows"),
        "processedRows": status_payload.get("processedRows"),
        "predictionBatches": status_payload.get("predictionBatches"),
        "predictionBatchSize": status_payload.get("predictionBatchSize"),
        "createdAt": job_info.get("createdAt"),
        "updatedAt": status_payload.get("updatedAt"),
        "rowIds": status_payload.get("rowIds"),
    }
    return transform_lion_results(result_payload, header, row_id_lookup), metadata

def run_wikidata_reconciliation(
    rows: List[Dict[str, Any]],
    header: List[str],
    column_indices: List[int],
    language: Optional[str]
) -> List[Dict[str, Any]]:
    reconcile_lang = (language or WIKIDATA_RECONCILE_LANG or "en").strip() or "en"
    reconcile_url = WIKIDATA_RECONCILE_URL.replace("/en/", f"/{reconcile_lang}/") if "/en/" in WIKIDATA_RECONCILE_URL else WIKIDATA_RECONCILE_URL
    queries = {}
    for row in rows:
        for idx in column_indices:
            value = row.get("data", [])[idx] if idx < len(row.get("data", [])) else ""
            if not value:
                continue
            key = f"r{row['idRow']}_c{idx}"
            queries[key] = {"query": value}

    if not queries:
        return []

    try:
        response = requests.post(
            reconcile_url,
            data={"queries": json.dumps(queries)},
            timeout=60
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Wikidata reconciliation failed: {exc}") from exc

    payload = response.json()
    cells: List[Dict[str, Any]] = []
    for key, value in payload.items():
        try:
            row_part, col_part = key.split("_c")
            row_id = int(row_part.replace("r", ""))
            column_index = int(col_part)
        except (ValueError, AttributeError):
            continue
        column_name = header[column_index] if column_index < len(header) else f"Column {column_index}"
        candidates = []
        for result in value.get("result", []):
            raw_types = result.get("type")
            formatted_types = []
            if isinstance(raw_types, list):
                for entry in raw_types:
                    if isinstance(entry, dict):
                        formatted_types.append({
                            "id": entry.get("id"),
                            "name": entry.get("name") or entry.get("id")
                        })
            candidates.append({
                "id": result.get("id"),
                "name": result.get("name"),
                "description": result.get("description"),
                "score": result.get("score"),
                "match": result.get("match", False),
                "types": formatted_types,
                "source": "wikidata_reconcile"
            })
        if candidates:
            cells.append({
                "rowId": row_id,
                "columnIndex": column_index,
                "columnName": column_name,
                "candidates": candidates
            })
    return cells

@app.on_event("startup")
def create_admin_user():
    """
    Create an admin user from environment variables if it doesn't already exist.
    """
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")

    if not admin_email or not admin_password:
        print("Admin credentials not provided in environment variables.")
        return

    if not db.users.find_one({"email": admin_email}):
        hashed_password = pwd_context.hash(admin_password)
        db.users.insert_one({"email": admin_email, "password": hashed_password, "role": "admin"})
        print(f"Admin user '{admin_email}' created successfully.")
    else:
        print(f"Admin user '{admin_email}' already exists.")

# Routes
@app.post("/register", response_model=dict)
def register(user: User, current_user: dict = Depends(get_current_user)):
    """
    Register a new user (Admin only).
    """
    is_admin_user(current_user)  # Ensure the current user is an admin

    if db.users.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="User already exists")

    hashed_password = get_password_hash(user.password)
    db.users.insert_one({"email": user.email, "password": hashed_password})
    return {"msg": "User created successfully"}

@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Login and get an access token.
    """
    user = db.users.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Include the user's role in the JWT token
    access_token = create_access_token(data={"sub": user["email"], "role": user.get("role", "user")})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/upload-users", response_model=dict)
def upload_users(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """
    Upload a CSV file to create multiple users (Admin only).
    """
    is_admin_user(current_user)  # Ensure the current user is an admin

    try:
        content = file.file.read().decode("utf-8").splitlines()
        reader = csv.DictReader(content)
        for row in reader:
            email = row.get("email")
            password = row.get("password")
            if not email or not password:
                continue
            if db.users.find_one({"email": email}):
                continue
            hashed_password = get_password_hash(password)
            db.users.insert_one({"email": email, "password": hashed_password})
        return {"msg": "Users uploaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

@app.delete("/delete-user/{email}", response_model=dict)
def delete_user(email: str, current_user: dict = Depends(get_current_user)):
    """
    Delete a user by email (Admin only).
    """
    is_admin_user(current_user)  # Ensure the current user is an admin

    result = db.users.delete_one({"email": email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"msg": f"User {email} deleted successfully"}

# Dataset & table management
@app.post("/datasets", response_model=dict)
def create_dataset(dataset: DatasetCreate, current_user: dict = Depends(get_current_user)):
    dataset_name = normalize_name(dataset.dataset_name)
    if not dataset_name:
        raise HTTPException(status_code=400, detail="Dataset name cannot be empty")

    existing = datasets_collection.find_one({
        "dataset_name": dataset_name,
        "owner": current_user["email"]
    })
    if existing:
        raise HTTPException(status_code=400, detail="Dataset already exists")

    doc = {
        "dataset_name": dataset_name,
        "owner": current_user["email"],
        "created_at": datetime.utcnow()
    }
    datasets_collection.insert_one(doc)
    return {
        "dataset_name": dataset_name,
        "created_at": doc["created_at"]
    }

@app.get("/datasets", response_model=dict)
def list_datasets(
    page: int = 1,
    per_page: int = 10,
    current_user: dict = Depends(get_current_user)
):
    page = max(1, page)
    per_page = min(50, max(1, per_page))
    query = {"owner": current_user["email"]}
    total = datasets_collection.count_documents(query)
    cursor = (
        datasets_collection
        .find(query)
        .sort("created_at", -1)
        .skip((page - 1) * per_page)
        .limit(per_page)
    )
    data = []
    for item in cursor:
        data.append({
            "datasetName": item["dataset_name"],
            "totalTables": tables_collection.count_documents({
                "dataset_name": item["dataset_name"],
                "owner": current_user["email"]
            }),
            "totalRows": rows_collection.count_documents({
                "dataset_name": item["dataset_name"],
                "owner": current_user["email"]
            }),
            "createdAt": item.get("created_at")
        })
    pagination = build_pagination(page, per_page, total)
    return {"data": data, "pagination": pagination}

@app.delete("/datasets/{dataset_name}", response_model=dict)
def delete_dataset(dataset_name: str, current_user: dict = Depends(get_current_user)):
    dataset = get_dataset_or_404(dataset_name, current_user["email"])
    datasets_collection.delete_one({"_id": dataset["_id"]})
    tables_collection.delete_many({
        "dataset_name": dataset_name,
        "owner": current_user["email"]
    })
    rows_collection.delete_many({
        "dataset_name": dataset_name,
        "owner": current_user["email"]
    })
    return {"msg": f"Dataset '{dataset_name}' deleted"}

@app.get("/datasets/{dataset_name}/tables", response_model=dict)
def list_tables(
    dataset_name: str,
    page: int = 1,
    per_page: int = 10,
    next_cursor: Optional[str] = Query(None),
    prev_cursor: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    get_dataset_or_404(dataset_name, current_user["email"])
    page = resolve_page(page, next_cursor, prev_cursor)
    per_page = min(25, max(1, per_page))
    query = {
        "dataset_name": dataset_name,
        "owner": current_user["email"]
    }
    total = tables_collection.count_documents(query)
    cursor = (
        tables_collection
        .find(query)
        .sort("created_at", -1)
        .skip((page - 1) * per_page)
        .limit(per_page)
    )
    data = []
    for item in cursor:
        data.append({
            "tableName": item["table_name"],
            "totalRows": item.get("total_rows", 0),
            "createdAt": item.get("created_at"),
            "status": item.get("status", "DONE")
        })
    pagination = build_pagination(page, per_page, total)
    return {"data": data, "pagination": pagination}

@app.delete("/datasets/{dataset_name}/tables/{table_name}", response_model=dict)
def delete_table(
    dataset_name: str,
    table_name: str,
    current_user: dict = Depends(get_current_user)
):
    get_dataset_or_404(dataset_name, current_user["email"])
    result = tables_collection.delete_one({
        "dataset_name": dataset_name,
        "table_name": table_name,
        "owner": current_user["email"]
    })
    rows_collection.delete_many({
        "dataset_name": dataset_name,
        "table_name": table_name,
        "owner": current_user["email"]
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    return {"msg": f"Table '{table_name}' deleted"}

@app.post("/datasets/{dataset_name}/tables/upload", response_model=dict)
def upload_table(
    dataset_name: str,
    file: UploadFile = File(...),
    table_name: Optional[str] = Form(None),
    column_classification: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    get_dataset_or_404(dataset_name, current_user["email"])
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
    column_types = build_column_type_summary(header, classification)

    # Remove existing rows for this table
    rows_collection.delete_many({
        "dataset_name": dataset_name,
        "table_name": resolved_table_name,
        "owner": current_user["email"]
    })

    documents = []
    row_counter = 0
    for row in reader:
        if not row or not any(cell.strip() for cell in row):
            continue
        padded = row + [""] * (len(header) - len(row))
        trimmed = padded[:len(header)]
        documents.append({
            "dataset_name": dataset_name,
            "table_name": resolved_table_name,
            "owner": current_user["email"],
            "idRow": row_counter,
            "data": trimmed,
            "linked_entities": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        })
        row_counter += 1

    if documents:
        rows_collection.insert_many(documents)

    tables_collection.update_one(
        {
            "dataset_name": dataset_name,
            "table_name": resolved_table_name,
            "owner": current_user["email"]
        },
        {
            "$set": {
                "header": header,
                "total_rows": row_counter,
                "status": "DONE",
                "column_types": column_types,
                "classified_columns": classification,
                "updated_at": datetime.utcnow()
            },
            "$setOnInsert": {
                "created_at": datetime.utcnow()
            }
        },
        upsert=True
    )

    return {
        "dataset_name": dataset_name,
        "table_name": resolved_table_name,
        "total_rows": row_counter,
        "status": "DONE"
    }

@app.get("/datasets/{dataset_name}/tables/{table_name}", response_model=dict)
def get_table_data(
    dataset_name: str,
    table_name: str,
    page: int = 1,
    per_page: int = 10,
    search: Optional[str] = None,
    search_columns: Optional[List[int]] = Query(None),
    include_types: Optional[List[str]] = Query(None),  # placeholders for future filtering
    exclude_types: Optional[List[str]] = Query(None),
    sort_by: Optional[str] = None,
    sort_direction: Optional[str] = None,
    next_cursor: Optional[str] = Query(None),
    prev_cursor: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    get_dataset_or_404(dataset_name, current_user["email"])
    table = get_table_or_404(dataset_name, table_name, current_user["email"])
    resolved_page = resolve_page(page, next_cursor, prev_cursor)
    per_page = min(100, max(1, per_page))

    query: Dict[str, Any] = {
        "dataset_name": dataset_name,
        "table_name": table_name,
        "owner": current_user["email"]
    }

    if search:
        target_columns = search_columns if search_columns else list(range(len(table.get("header", []))))
        regex = {"$regex": search, "$options": "i"}
        or_filters = [{f"data.{idx}": regex} for idx in target_columns]
        if or_filters:
            query["$or"] = or_filters

    total_rows = rows_collection.count_documents(query)
    cursor = (
        rows_collection
        .find(query)
        .sort("idRow", 1 if sort_direction != "desc" else -1)
        .skip((resolved_page - 1) * per_page)
        .limit(per_page)
    )
    rows = [serialize_row(row) for row in cursor]

    pagination = build_pagination(resolved_page, per_page, total_rows)

    response_payload = {
        "data": {
            "dataset_name": dataset_name,
            "table_name": table_name,
            "header": table.get("header", []),
            "rows": rows,
            "classified_columns": table.get("classified_columns", {}),
            "column_types": table.get("column_types", {}),
            "status": table.get("status", "DONE"),
            "total_rows": table.get("total_rows", total_rows),
            "total_matches": total_rows
        },
        "pagination": pagination
    }
    return response_payload

@app.get("/datasets/{dataset_name}/tables/{table_name}/status", response_model=dict)
def get_table_status_endpoint(
    dataset_name: str,
    table_name: str,
    current_user: dict = Depends(get_current_user)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"])
    total_rows = table.get("total_rows", rows_collection.count_documents({
        "dataset_name": dataset_name,
        "table_name": table_name,
        "owner": current_user["email"]
    }))
    return {
        "status": table.get("status", "DONE"),
        "phase": "DONE" if table.get("status") == "DONE" else "PROCESSING",
        "completed_rows": total_rows,
        "total_rows": total_rows,
        "completion_percentage": 100
    }

@app.get("/datasets/{dataset_name}/tables/{table_name}/export")
def export_table_csv(
    dataset_name: str,
    table_name: str,
    fields: Optional[List[str]] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"])
    cursor = rows_collection.find({
        "dataset_name": dataset_name,
        "table_name": table_name,
        "owner": current_user["email"]
    }).sort("idRow", 1)

    annotation_fields = fields or []
    output = StringIO()
    writer = csv.writer(output)

    header_row = table.get("header", [])[:]
    if annotation_fields:
        for idx, column_name in enumerate(table.get("header", [])):
            for field in annotation_fields:
                header_row.append(f"{column_name}_{field}")
    writer.writerow(header_row)

    for row in cursor:
        row_values = row.get("data", [])[:]
        if annotation_fields:
            for idx in range(len(table.get("header", []))):
                row_values.extend(extract_candidate_fields(row.get("linked_entities", []), idx, annotation_fields))
        writer.writerow(row_values)

    output.seek(0)
    filename = f"{dataset_name}_{table_name}_export.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.post("/datasets/{dataset_name}/tables/{table_name}/linking", response_model=dict)
def run_linking_task(
    dataset_name: str,
    table_name: str,
    request: LinkingRequest,
    current_user: dict = Depends(get_current_user)
):
    table = get_table_or_404(dataset_name, table_name, current_user["email"])
    header = table.get("header", [])
    if not header:
        raise HTTPException(status_code=400, detail="Table header is empty")

    column_indices = sorted(set(request.column_indices or []))
    row_ids = sorted(set(request.row_ids or []))
    if not column_indices or not row_ids:
        raise HTTPException(status_code=400, detail="Row IDs and column indices are required")
    if len(row_ids) > LINKING_MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot link more than {LINKING_MAX_ROWS} rows at once"
        )
    for idx in column_indices:
        if idx < 0 or idx >= len(header):
            raise HTTPException(status_code=400, detail=f"Column index {idx} is out of range")

    rows = fetch_rows_by_ids(dataset_name, table_name, current_user["email"], row_ids)
    if len(rows) != len(row_ids):
        raise HTTPException(status_code=400, detail="One or more row IDs do not exist in this table")

    provider = request.provider.lower()
    provider_metadata: Optional[Dict[str, Any]] = None
    if provider == "lion":
        cells, provider_metadata = run_lion_linking(
            dataset_name,
            table_name,
            header,
            rows,
            column_indices,
            row_ids,
            request.options
        )
    elif provider in {"wikidata", "wikidata_reconcile", "reconcile"}:
        cells = run_wikidata_reconciliation(rows, header, column_indices, request.language)
        provider = "wikidata_reconcile"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{request.provider}'")

    response_payload: Dict[str, Any] = {
        "provider": provider,
        "cells": cells
    }
    if provider_metadata:
        response_payload["metadata"] = provider_metadata
    return response_payload

@app.put("/datasets/{dataset_name}/tables/{table_name}/rows/{row_id}/columns/{column_index}", response_model=dict)
def update_annotation_endpoint(
    dataset_name: str,
    table_name: str,
    row_id: int,
    column_index: int,
    payload: AnnotationPayload,
    current_user: dict = Depends(get_current_user)
):
    get_table_or_404(dataset_name, table_name, current_user["email"])
    row = rows_collection.find_one({
        "dataset_name": dataset_name,
        "table_name": table_name,
        "owner": current_user["email"],
        "idRow": row_id
    })
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")

    candidate_info = payload.candidate_info or {}

    def normalize_candidate(raw: Dict[str, Any], idx: int = 0) -> Optional[Dict[str, Any]]:
        if not isinstance(raw, dict):
            return None
        candidate_id = raw.get("id") or candidate_info.get("id") or payload.entity_id
        if not candidate_id:
            return None
        return {
            "id": candidate_id,
            "match": raw.get("match", idx == 0),
            "score": raw.get("score", payload.score),
            "notes": raw.get("notes", payload.notes or ""),
            "name": raw.get("name", candidate_info.get("name")),
            "description": raw.get("description", candidate_info.get("description")),
            "types": raw.get("types", candidate_info.get("types", [])),
            "source": raw.get("source", candidate_info.get("source", "manual"))
        }

    primary_candidate = {
        "id": payload.entity_id,
        "match": payload.match,
        "score": payload.score,
        "notes": payload.notes or "",
        "name": candidate_info.get("name"),
        "description": candidate_info.get("description"),
        "types": candidate_info.get("types", []),
        "source": candidate_info.get("source", "manual")
    }

    linked_entities = row.get("linked_entities", [])
    entry = next((entity for entity in linked_entities if entity.get("idColumn") == column_index), None)
    if not entry:
        entry = {"idColumn": column_index, "candidates": []}
        linked_entities.append(entry)

    normalized_candidates: List[Dict[str, Any]] = []
    provided_candidates = payload.candidates or []
    for idx, raw_candidate in enumerate(provided_candidates):
        normalized = normalize_candidate(raw_candidate, idx)
        if normalized:
            normalized_candidates.append(normalized)

    def deduplicate(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        unique = []
        seen = set()
        for cand in candidates:
            cand_id = cand.get("id")
            if not cand_id or cand_id in seen:
                continue
            seen.add(cand_id)
            unique.append(cand)
        return unique

    if normalized_candidates:
        normalized_candidates = deduplicate(normalized_candidates)
        existing_candidates = entry.get("candidates", [])
        normalized_ids = {cand.get("id") for cand in normalized_candidates if cand.get("id")}
        existing_tail = [
            cand for cand in existing_candidates
            if cand.get("id") not in normalized_ids
        ]
        primary_in_list = next((cand for cand in normalized_candidates if cand.get("id") == payload.entity_id), None)
        remaining = [cand for cand in normalized_candidates if cand is not primary_in_list]
        if primary_in_list:
            entry["candidates"] = [primary_in_list] + remaining + existing_tail
        else:
            entry["candidates"] = [primary_candidate] + remaining + existing_tail
    else:
        filtered_candidates = [cand for cand in entry.get("candidates", []) if cand.get("id") != payload.entity_id]
        entry["candidates"] = [primary_candidate] + filtered_candidates

    if payload.explanation is not None:
        entry["explanation"] = payload.explanation
    elif entry.get("explanation") is None and candidate_info.get("explanation"):
        entry["explanation"] = candidate_info.get("explanation")

    rows_collection.update_one(
        {
            "dataset_name": dataset_name,
            "table_name": table_name,
            "owner": current_user["email"],
            "idRow": row_id
        },
        {
            "$set": {
                "linked_entities": linked_entities,
                "updated_at": datetime.utcnow()
            }
        }
    )
    return {"msg": "Annotation updated"}

@app.delete("/datasets/{dataset_name}/tables/{table_name}/rows/{row_id}/columns/{column_index}/candidates/{entity_id}", response_model=dict)
def delete_annotation_endpoint(
    dataset_name: str,
    table_name: str,
    row_id: int,
    column_index: int,
    entity_id: str,
    current_user: dict = Depends(get_current_user)
):
    get_table_or_404(dataset_name, table_name, current_user["email"])
    row = rows_collection.find_one({
        "dataset_name": dataset_name,
        "table_name": table_name,
        "owner": current_user["email"],
        "idRow": row_id
    })
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")

    linked_entities = row.get("linked_entities", [])
    entry = next((entity for entity in linked_entities if entity.get("idColumn") == column_index), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Entity column mapping not found")

    filtered = [candidate for candidate in entry.get("candidates", []) if candidate.get("id") != entity_id]
    if not filtered:
        linked_entities = [entity for entity in linked_entities if entity.get("idColumn") != column_index]
    else:
        entry["candidates"] = filtered

    rows_collection.update_one(
        {
            "dataset_name": dataset_name,
            "table_name": table_name,
            "owner": current_user["email"],
            "idRow": row_id
        },
        {
            "$set": {
                "linked_entities": linked_entities,
                "updated_at": datetime.utcnow()
            }
        }
    )
    return {"msg": f"Candidate '{entity_id}' deleted"}
