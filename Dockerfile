# Dockerfile
# Use an official Node.js runtime as the parent image
FROM node:14

# Set the working directory in the container to /app
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the project files to the working directory
COPY . .

# Make port 3000 available outside this container
EXPOSE 3000

# Run the application when the container launches
CMD ["npm", "run", "dev"]
