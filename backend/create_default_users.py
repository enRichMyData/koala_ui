from pymongo import MongoClient
from flask_bcrypt import Bcrypt

# Connect to MongoDB
client = MongoClient('mongodb://mongo:27017/')
db = client.mydatabase  # Change 'mydatabase' to your actual database name

# Initialize Bcrypt for password hashing
bcrypt = Bcrypt()

# Function to create default users
def create_default_users():
    # List of default user data (email and password)
    default_users = [
        {"email": "user1@example.com", "password": "password1"},
        {"email": "user2@example.com", "password": "password2"},
        # Add more default users as needed
    ]

    # Insert each default user into the database
    for user_data in default_users:
        email = user_data["email"]
        password = user_data["password"]

        # Check if the user already exists
        if db.users.find_one({"email": email}):
            print(f"User '{email}' already exists.")
            continue

        # Hash the password
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')

        # Insert the user into the database
        db.users.insert_one({"email": email, "password": hashed_password})
        print(f"User '{email}' created successfully.")

# Create default users
if __name__ == "__main__":
    create_default_users()
