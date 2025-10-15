FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package manifests first to leverage Docker layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm install --production

# Copy the rest of the backend source
COPY . .

# Expose the default application port
EXPOSE 5000

# Run the API server
CMD ["node", "server.js"]
