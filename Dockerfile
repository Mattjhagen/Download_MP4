# Use a Node.js base image that includes a standard Linux environment
FROM node:18-bullseye-slim

# Install FFmpeg, Python 3, and curl (required for yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download latest compiled linux yt-dlp binary (bypasses python version requirement)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set yt-dlp path for the server to use
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy the rest of your backend code
COPY . .

# Expose the port your API uses
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
