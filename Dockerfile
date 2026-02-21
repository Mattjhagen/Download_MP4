# Use a Node.js base image that includes a standard Linux environment
FROM node:18-bullseye-slim

# Install FFmpeg and Python 3 (required for yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your backend code
COPY . .

# Expose the port your API uses
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
