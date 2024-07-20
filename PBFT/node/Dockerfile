# Dockerfile

# Use Node.js base image
FROM node:14

# Set working directory
WORKDIR /app

# Install SQLite3
RUN apt-get update && apt-get install -y sqlite3 libsqlite3-dev

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --build-from-source

# Copy application files
COPY . .

# Expose port
EXPOSE 3000
EXPOSE 4000

# Command to run the application
CMD ["node", "pbft.js"]
