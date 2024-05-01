from flask import Flask, jsonify, request
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from flask_pymongo import PyMongo

app = Flask(__name__)
CORS(app)
app.config['JWT_SECRET_KEY'] = 'mysecretkey'
app.config['MONGO_URI'] = 'mongodb://mongo:27017/mydatabase'  # Example MongoDB URI
mongo = PyMongo(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

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
    print("login!!", flush=True)
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

if __name__ == '__main__':
    app.run(debug=True)
