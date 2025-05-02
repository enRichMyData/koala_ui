from flask import Flask, jsonify, request
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from flask_pymongo import PyMongo
import os

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # Allow all origins

# Get required environment variables without fallbacks
if 'JWT_SECRET_KEY' not in os.environ:
    raise RuntimeError("JWT_SECRET_KEY environment variable is required")

if 'MONGO_URI' not in os.environ:
    raise RuntimeError("MONGO_URI environment variable is required")

app.config['JWT_SECRET_KEY'] = os.environ['JWT_SECRET_KEY']

# Append database name to MongoDB URI
mongo_uri = os.environ['MONGO_URI']
if not mongo_uri.endswith('/'):
    mongo_uri += '/'
app.config['MONGO_URI'] = mongo_uri + 'koala_db'

mongo = PyMongo(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

def create_default_admin():
    admin_email = "admin@example.com"
    admin_password = "admin"

    users_collection = mongo.db.users
    if not users_collection.find_one({"email": admin_email}):
        hashed_password = bcrypt.generate_password_hash(admin_password).decode('utf-8')
        users_collection.insert_one({"email": admin_email, "password": hashed_password})
        print(f"Default admin user '{admin_email}' created successfully.")
    else:
        print(f"Default admin user '{admin_email}' already exists.")


create_default_admin()


# Route to create a new user (registration)
@app.route('/register', methods=['POST'])
def register():
    email = request.json.get('email')
    password = request.json.get('password')

    if not email or not password:
        return jsonify({"msg": "Missing email or password"}), 400

    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    users_collection = mongo.db.users
    users_collection.insert_one({"email": email, "password": hashed_password})

    return jsonify({"msg": "User created successfully"}), 201

# Route to authenticate and generate access token (login)
@app.route('/login', methods=['POST'])
def login():
    email = request.json.get('email')
    password = request.json.get('password')

    users_collection = mongo.db.users
    user = users_collection.find_one({"email": email})
    if not user or not bcrypt.check_password_hash(user['password'], password):
        return jsonify({"msg": "Invalid email or password"}), 401

    access_token = create_access_token(identity=email)
    return jsonify(access_token=access_token), 200

# Protected route that requires JWT
@app.route('/protected', methods=['GET'])
@jwt_required()
def protected():
    current_user = get_jwt_identity()
    return jsonify(logged_in_as=current_user), 200
