FROM node:latest

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json and install dependencies
COPY package.json ./
COPY package-lock.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port your application listens on
EXPOSE 26658


# Command to run your application
CMD ["node", "state/abci.js"]
