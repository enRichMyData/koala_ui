# Choose the base image
FROM node:20.5

# Create app directory in Docker
WORKDIR /app

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install app dependencies in Docker
RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source inside Docker
COPY . .

# Build the Next.js app
RUN npx create-next-app . --use-npm

# Expose the port
EXPOSE 3000

# Start the app
CMD [ "npm", "run", "dev" ]
