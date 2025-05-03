from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
from passlib.context import CryptContext
from jose import JWTError, jwt
import os
import csv
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

# JWT configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY environment variable is required")

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
