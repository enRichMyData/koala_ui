# Start from the official Node.js 14 image
FROM node:14

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json before other files
# Utilize Docker cache to save re-installing dependencies if unchanged
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Build the Next.js app
RUN npm run build

# Expose the listening port
EXPOSE 3000

# Run npm start script
CMD [ "npm", "run", "start" ]
