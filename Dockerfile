# Start from the official Node.js LTS image
FROM node:16

# Set the working directory
WORKDIR /app

# Add `/app/node_modules/.bin` to $PATH
ENV PATH /app/node_modules/.bin:$PATH

# Install application dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

# Build the application
RUN npm run build

# Expose the listening port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"]
