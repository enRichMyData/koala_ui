# frontend/Dockerfile
ARG NODE_VERSION
FROM node:${NODE_VERSION}


# Step 2: Set the working directory inside the container
WORKDIR /app

# Step 3: Copy package.json and package-lock.json
COPY package*.json ./

# Step 4: Install dependencies
RUN npm install

# Step 5: Copy the rest of your app's source code
COPY . .

# Step 6: Expose port 3000 to have it mapped by Docker daemon
EXPOSE 3000

# Step 7: Define the command to run your app
CMD ["npm", "start"]
